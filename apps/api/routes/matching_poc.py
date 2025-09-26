"""Simplified matching routes for POC – direct OpenAI (or configured LLM) calls.

Adds metered credit tracking using Stripe usage records while keeping the
session-only architecture (no database persistence).
"""
import os
import re
import json
import asyncio
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger
import stripe
from datetime import datetime, timezone

from services.llm_provider import llm_provider, LLMProviderError
from services.stripe_metering import (
    get_subscription_info_for_email,
    get_usage_summary,
    project_credit_balances,
    record_usage,
)

router = APIRouter()

# Default mock results used when LLM provider fails
MOCK_LLM_RESULTS = [
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

# Configure Stripe for paid check by email (POC does not use DB)
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
if not stripe.api_key:
    logger.warning("STRIPE_SECRET_KEY not configured - paid checks will be treated as unpaid")


CREDIT_COST_MIN = int(os.getenv("CREDIT_COST_MIN", 1))
CREDIT_COST_MAX = int(os.getenv("CREDIT_COST_MAX", 10))
CREDIT_COST_DEFAULT = int(os.getenv("CREDIT_COST_DEFAULT", 1))


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
    raw_email: str
    reason: str
    email_draft: str
    score: float


class CreditSummary(BaseModel):
    """Credit summary returned to the frontend."""

    included_credits: int
    used_credits: int
    remaining_credits: int
    pending_credits: int
    projected_used_credits: int
    projected_remaining_credits: int
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    stripe_subscription_item_id: Optional[str] = None
    period_start: Optional[int] = None
    period_end: Optional[int] = None


class MatchResponse(BaseModel):
    """Match response model."""

    results: list[MatchResult]
    user_company: Optional[str]
    query_processed: str
    revealed: bool
    credits_charged: Optional[int] = None
    credit_summary: Optional[CreditSummary] = None


def _build_match_response(
    *,
    results_source: list[Dict[str, Any]],
    request: MatchRequest,
    user_company: Optional[str],
    is_paid: bool,
    credits_charged: Optional[int] = None,
    credit_summary: Optional[CreditSummary] = None,
) -> MatchResponse:
    match_results: list[MatchResult] = []

    for i, result in enumerate(results_source[: request.max_results]):
        logger.info(f"📝 Processing result {i + 1}: {result.get('name', 'Unknown')}")
        company_name = result.get("company", "Media Company")
        plain_email = result.get("email", f"contact{i + 1}@company.com")

        match_results.append(
            MatchResult(
                name=result.get("name", f"Contact {i + 1}"),
                title=result.get("title", "Industry Professional"),
                company_name=company_name,
                company_blurred=company_name if is_paid else blur_company_name(company_name),
                email_plain=plain_email if is_paid else "",
                email_masked=plain_email if is_paid else mask_email(plain_email),
                raw_email=plain_email,
                reason=result.get("reason", "Industry professional with relevant experience"),
                email_draft=result.get("email_draft", "Professional outreach email"),
                score=0.9 - (i * 0.1),
            )
        )

    logger.bind(
        count=len(match_results),
        paid=is_paid,
        user_company=user_company,
        query=request.query[:80],
    ).info("🎉 Returning matches")

    return MatchResponse(
        results=match_results,
        user_company=user_company,
        query_processed=request.query,
        revealed=is_paid,
        credits_charged=credits_charged,
        credit_summary=credit_summary,
    )


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


async def call_llm_api(query: str, user_company: Optional[str] = None) -> list[Dict[str, Any]]:
    """Call the configured LLM provider (default OpenAI) to get matching recommendations."""

    prompt = f"""
You are an AI assistant for the film and TV industry. A user is asking: "{query}"

User's company: {user_company if user_company else "Unknown"}

Please provide exactly 4 relevant contacts that this user should reach out to.
For each contact, provide:
1. Person's full name
2. Their job title
3. Company name
4. Email address (use realistic format: firstname.lastname@company.com)
5. Brief reason why this is a good match (2-3 sentences)
6. A short, professional outreach email draft (2-3 sentences max)

Focus on real industry companies from the film, tv, media and entertainment industry.

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

    try:
        results = await llm_provider.generate_json_array(prompt=prompt)
        logger.info(
            "Successfully parsed %d results from %s",
            len(results),
            llm_provider.provider_name,
        )
        return results
    except LLMProviderError as exc:
        logger.warning("LLM provider unavailable (%s); using mock results", exc)
        return MOCK_LLM_RESULTS


async def estimate_credit_cost(query: str) -> int:
    """Estimate credit usage for a query via the configured LLM."""

    if not query:
        return CREDIT_COST_DEFAULT

    clamp = lambda value: max(CREDIT_COST_MIN, min(CREDIT_COST_MAX, value))

    estimation_prompt = (
        "You are a senior film and TV operations analyst. "
        "Rate the complexity of the following request on a scale of "
        f"{CREDIT_COST_MIN} (trivial) to {CREDIT_COST_MAX} (extremely complex). "
        "Respond with digits only—no punctuation, words, or explanation.\n\n"
        f"Request: {query}\n"
    )

    try:
        raw = await llm_provider.estimate_credit_cost(prompt=estimation_prompt, default=CREDIT_COST_DEFAULT)
        logger.debug("LLM estimated credit cost: %s", raw)
        return clamp(raw)
    except LLMProviderError as exc:
        logger.warning("Credit estimation provider error: %s", exc)

    heuristic = max(len(query.strip()) // 120, CREDIT_COST_DEFAULT)
    return clamp(heuristic or CREDIT_COST_DEFAULT)


@router.post("/match", response_model=MatchResponse)
async def create_match_poc(request: MatchRequest):
    """Create a match using the configured LLM provider (OpenAI by default)."""
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

        # Resolve Stripe subscription details (if any)
        subscription_info = get_subscription_info_for_email(request.user_email)
        is_paid = bool(subscription_info)
        logger.info(
            "💳 Stripe subscription lookup",
            email=request.user_email,
            is_paid=is_paid,
            subscription_id=getattr(subscription_info, "subscription_id", None),
        )

        usage_summary = (
            get_usage_summary(subscription_info.subscription_item_id)
            if subscription_info
            else None
        )

        # Determine credit cost via the LLM (or heuristic fallback)
        credits_charged = await estimate_credit_cost(request.query)
        logger.info(
            "🧮 Credit cost determined",
            credits_charged=credits_charged,
            subscription_present=is_paid,
        )

        # Call OpenAI (or whichever provider is configured)
        logger.info("🤖 Calling OpenAI (or configured LLM) API...")
        llm_results = await call_llm_api(request.query, user_company)
        logger.info(
            "✅ LLM response returned %d results via %s",
            len(llm_results),
            llm_provider.provider_name,
        )

        credit_summary_payload: Optional[CreditSummary] = None
        if subscription_info:
            record_usage(
                subscription_item_id=subscription_info.subscription_item_id,
                quantity=credits_charged,
            )

            if usage_summary is None:
                usage_summary = get_usage_summary(subscription_info.subscription_item_id)

            balances = project_credit_balances(
                included_credits=subscription_info.included_credits,
                usage_summary=usage_summary,
                additional_usage=credits_charged,
            )

            credit_summary_payload = CreditSummary(
                included_credits=subscription_info.included_credits,
                used_credits=balances["used"],
                remaining_credits=balances["remaining"],
                pending_credits=balances["pending"],
                projected_used_credits=balances["projected_used"],
                projected_remaining_credits=balances["projected_remaining"],
                stripe_customer_id=subscription_info.customer_id,
                stripe_subscription_id=subscription_info.subscription_id,
                stripe_subscription_item_id=subscription_info.subscription_item_id,
                period_start=usage_summary.period_start if usage_summary else None,
                period_end=usage_summary.period_end if usage_summary else None,
            )
        else:
            credit_summary_payload = None

        return _build_match_response(
            results_source=llm_results,
            request=request,
            user_company=user_company,
            is_paid=is_paid,
            credits_charged=credits_charged,
            credit_summary=credit_summary_payload,
        )

    except Exception:
        logger.exception("POC match creation failed; returning fallback results")

        fallback_user_company = (
            get_company_from_email(request.user_email) if request.user_email else None
        )

        fallback_subscription = (
            get_subscription_info_for_email(request.user_email)
            if request.user_email
            else None
        )
        fallback_is_paid = bool(fallback_subscription)

        return _build_match_response(
            results_source=MOCK_LLM_RESULTS,
            request=request,
            user_company=fallback_user_company,
            is_paid=fallback_is_paid,
            credits_charged=None,
            credit_summary=None,
        )


@router.get("/health")
async def health_check():
    """Health check for POC matching service."""
    return {
        "status": "healthy",
        "service": "viqi-matching-poc",
        "llm_provider": llm_provider.provider_name,
        "openai_configured": llm_provider.provider_name == "openai",
    }
