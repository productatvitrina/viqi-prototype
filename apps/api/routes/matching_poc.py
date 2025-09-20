"""Simplified matching routes for POC - Direct Gemini API calls only.

Implements session-level sign-in using email only (no DB/JWT) and a Stripe
paid check by email to decide whether to return blurred or revealed results.
"""
import os
import json
import asyncio
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger
import google.generativeai as genai
import stripe
from datetime import datetime, timezone

router = APIRouter()

# Configure Gemini - For POC, we'll use mock responses
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MOCK_GEMINI_RESULTS = [
    {
        "name": "Sarah Martinez",
        "title": "Director of Content Acquisition",
        "company": "Netflix",
        "email": "sarah.martinez@netflix.com",
        "reason": "Sarah leads Netflix's independent film acquisition and has experience with similar projects in your genre.",
        "email_draft": "Hi Sarah, I'm reaching out about our film project that would be perfect for Netflix's slate. Would you be available for a brief call?"
    },
    {
        "name": "Michael Chen",
        "title": "VP of Production",
        "company": "Warner Bros Pictures",
        "email": "michael.chen@warnerbros.com",
        "reason": "Michael oversees production partnerships and has a track record of supporting innovative storytelling.",
        "email_draft": "Hi Michael, I'd love to discuss our upcoming project with Warner Bros. The story aligns well with your recent successful releases."
    },
    {
        "name": "Jessica Rodriguez",
        "title": "Head of Business Development",
        "company": "A24",
        "email": "jessica.rodriguez@a24films.com",
        "reason": "Jessica focuses on unique, artist-driven content that matches A24's brand and your project's vision.",
        "email_draft": "Hi Jessica, our film project embodies the creative spirit A24 is known for. I'd appreciate the opportunity to share more details."
    },
    {
        "name": "David Park",
        "title": "Senior Director of Acquisitions",
        "company": "Sony Pictures Classics",
        "email": "david.park@sonyclassics.com",
        "reason": "David specializes in acquiring distinctive films with strong artistic merit and commercial potential.",
        "email_draft": "Hi David, I believe our project would be an excellent fit for Sony Pictures Classics' portfolio. Could we schedule a time to discuss?"
    }
]

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
    logger.info("Gemini API configured for POC")
else:
    logger.info("Using mock responses for POC - no GEMINI_API_KEY")
    model = None

# Configure Stripe for paid check by email (POC does not use DB)
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
if not stripe.api_key:
    logger.warning("STRIPE_SECRET_KEY not configured - paid checks will be treated as unpaid")


class MatchRequest(BaseModel):
    """Match request model."""
    query: str
    user_email: Optional[str] = None
    max_results: int = 4


class MatchResult(BaseModel):
    """Individual match result."""
    name: str
    title: str
    company_name: str
    company_blurred: str
    email_masked: str
    email_plain: str
    reason: str
    email_draft: str
    score: float


class MatchResponse(BaseModel):
    """Match response model."""
    results: list[MatchResult]
    user_company: Optional[str]
    query_processed: str
    revealed: bool


def get_company_from_email(email: str) -> Optional[str]:
    """Extract company from email domain."""
    if not email or '@' not in email:
        return None
    
    domain = email.split('@')[1].lower()
    
    # Skip common free email providers
    free_providers = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com']
    if domain in free_providers:
        return None
    
    # Convert domain to company name (simple heuristic)
    company = domain.replace('.com', '').replace('.org', '').replace('.net', '')
    return company.replace('-', ' ').replace('_', ' ').title()


def mask_email(email: str) -> str:
    """Mask email address for preview."""
    if '@' not in email:
        return email
    
    local, domain = email.split('@')
    
    # Mask local part
    if len(local) <= 2:
        masked_local = '*' * len(local)
    else:
        masked_local = local[0] + '*' * (len(local) - 2) + local[-1]
    
    # Mask domain
    domain_parts = domain.split('.')
    if len(domain_parts) >= 2:
        main_domain = domain_parts[0]
        if len(main_domain) <= 3:
            masked_domain = '*' * len(main_domain)
        else:
            masked_domain = main_domain[0] + '*' * (len(main_domain) - 2) + main_domain[-1]
        
        masked_domain += '.' + '.'.join(domain_parts[1:])
    else:
        masked_domain = domain
    
    return f"{masked_local}@{masked_domain}"


def blur_company_name(company: str) -> str:
    """Blur company name for preview."""
    if len(company) <= 3:
        return '*' * len(company)
    
    words = company.split()
    blurred_words = []
    
    for word in words:
        if len(word) <= 2:
            blurred_words.append('*' * len(word))
        elif len(word) <= 4:
            blurred_words.append(word[0] + '*' * (len(word) - 1))
        else:
            blurred_words.append(word[0] + '*' * (len(word) - 2) + word[-1])
    
    return ' '.join(blurred_words)


async def call_gemini_api(query: str, user_company: Optional[str] = None) -> list[Dict[str, Any]]:
    """Call Gemini API to get matching recommendations."""
    
    # Build the prompt
    prompt = f"""
You are an AI assistant for the film and TV industry. A user is asking: "{query}"

User's company: {user_company if user_company else "Unknown"}

Please provide exactly 4 relevant companies and key contacts that this user should reach out to. 
For each contact, provide:
1. Person's full name
2. Their job title  
3. Company name
4. Email address (use realistic format: firstname.lastname@company.com)
5. Brief reason why this is a good match (2-3 sentences)
6. A short, professional outreach email draft (2-3 sentences max)

Focus on real industry companies like Netflix, Warner Bros, Disney, Universal, Paramount, Sony Pictures, A24, Blumhouse, etc.

Return ONLY a valid JSON array with this structure:
[
  {{
    "name": "Sarah Johnson",
    "title": "VP of Development", 
    "company": "Netflix",
    "email": "sarah.johnson@netflix.com",
    "reason": "Sarah leads content acquisition at Netflix and specializes in independent films. She has greenlit several similar projects in the past year.",
    "email_draft": "Hi Sarah, I'm reaching out regarding our upcoming film project that aligns with Netflix's content strategy. Would you be available for a brief call to discuss potential collaboration opportunities?"
  }}
]
"""

    if not model:
        logger.info("Using mock Gemini response")
        return MOCK_GEMINI_RESULTS

    try:
        logger.info(f"Calling Gemini API with query: {query[:100]}...")
        timeout_seconds = float(os.getenv("GEMINI_TIMEOUT", 20))
        response = await asyncio.wait_for(
            asyncio.to_thread(model.generate_content, prompt),
            timeout=timeout_seconds
        )
        
        if not response.text:
            raise Exception("Empty response from Gemini")
        
        # Try to extract JSON from the response
        response_text = response.text.strip()
        
        # Remove any markdown formatting
        if response_text.startswith('```json'):
            response_text = response_text[7:]
        if response_text.endswith('```'):
            response_text = response_text[:-3]
        
        # Parse JSON
        results = json.loads(response_text.strip())
        
        if not isinstance(results, list):
            raise ValueError("Response is not a list")
        
        logger.info(f"Successfully parsed {len(results)} results from Gemini")
        return results
        
    except asyncio.TimeoutError:
        logger.warning("Gemini API call timed out; falling back to mock response")
        return MOCK_GEMINI_RESULTS

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini JSON response: {e}")
        logger.error(f"Raw response: {response.text if response else 'No response'}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    
    except Exception as e:
        logger.error(f"Gemini API call failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


def _is_paid_customer_by_email(email: str) -> bool:
    """Check Stripe to determine if the user (by email) has an active/trialing subscription.

    POC-only: no DB lookup; purely by email.
    """
    try:
        if not stripe.api_key:
            return False

        # List customers by email (Stripe may return multiple)
        customers = stripe.Customer.list(email=email, limit=10)
        now_epoch = int(datetime.now(tz=timezone.utc).timestamp())

        for cust in customers.auto_paging_iter():
            subs = stripe.Subscription.list(customer=cust.id, status="all", limit=10)
            for sub in subs.auto_paging_iter():
                status = sub.get("status")
                current_period_end = int(sub.get("current_period_end") or 0)
                if status in ["active", "trialing"] and current_period_end > now_epoch:
                    return True
        return False
    except Exception as e:
        logger.error(f"Stripe paid check failed for {email}: {e}")
        return False


@router.post("/match", response_model=MatchResponse)
async def create_match_poc(request: MatchRequest):
    """Create a match using direct Gemini API call - POC version."""
    logger.info(f"🎯 POC Match request received: {request.query}")
    logger.info(f"📧 User email: {request.user_email}")
    logger.info(f"🔢 Max results: {request.max_results}")
    
    try:
        # Require session-level sign-in via email (no DB/JWT in POC)
        if not request.user_email:
            raise HTTPException(status_code=401, detail="Not signed in. Please sign in via SSO or provide email.")

        # Extract user company from email (for LLM context)
        user_company = get_company_from_email(request.user_email)
        logger.info(f"🏢 Detected user company: {user_company}")

        # Determine paid status by querying Stripe using email
        is_paid = _is_paid_customer_by_email(request.user_email)
        logger.info(f"💳 Paid status for {request.user_email}: {is_paid}")
        
        # Call Gemini API
        logger.info("🤖 Calling Gemini API...")
        gemini_results = await call_gemini_api(request.query, user_company)
        logger.info(f"✅ Gemini API returned {len(gemini_results)} results")
        
        # Convert to response format
        match_results = []
        for i, result in enumerate(gemini_results[:request.max_results]):
            logger.info(f"📝 Processing result {i+1}: {result.get('name', 'Unknown')}")
            company_name = result.get("company", "Media Company")
            plain_email = result.get("email", f"contact{i+1}@company.com")

            # Reveal logic: if paid, return unblurred company and plain email.
            # If not paid, return blurred company and masked email, suppressing plain email.
            match_result = MatchResult(
                name=result.get("name", f"Contact {i+1}"),
                title=result.get("title", "Industry Professional"),
                company_name=company_name,
                company_blurred=company_name if is_paid else blur_company_name(company_name),
                email_plain=plain_email if is_paid else "",
                email_masked=plain_email if is_paid else mask_email(plain_email),
                reason=result.get("reason", "Industry professional with relevant experience"),
                email_draft=result.get("email_draft", "Professional outreach email"),
                score=0.9 - (i * 0.1)  # Simple scoring
            )
            match_results.append(match_result)
        
        response = MatchResponse(
            results=match_results,
            user_company=user_company,
            query_processed=request.query,
            revealed=is_paid
        )
        
        logger.info(f"🎉 Successfully returning {len(match_results)} matches for POC")
        logger.info(f"📋 Response summary: user_company={user_company}, query_processed={request.query}")
        return response
        
    except Exception as e:
        logger.error(f"POC match creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check for POC matching service."""
    return {
        "status": "healthy",
        "service": "viqi-matching-poc",
        "gemini_configured": bool(model)
    }
