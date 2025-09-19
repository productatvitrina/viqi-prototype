"""Matching routes for LLM-powered recommendations."""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from loguru import logger

from config.database import get_db
from models.models import User, Person, Company, Match, MatchResult, UsageLog
from routes.auth import get_current_user
from services.llm_service import LLMService

router = APIRouter()
llm_service = LLMService()


class MatchRequest(BaseModel):
    """Match request model."""
    query: str
    max_results: int = 4


class PersonPreview(BaseModel):
    """Person preview with masked information."""
    id: int
    name: str
    title: Optional[str]
    company_name: str
    company_blurred: bool = True
    email_masked: str
    reason: str
    email_draft_blurred: bool = True
    score: float


class PersonRevealed(BaseModel):
    """Person with revealed information."""
    id: int
    name: str
    title: Optional[str]
    company_name: str
    company_id: int
    email: str
    reason: str
    email_draft: str
    score: float


class MatchResponse(BaseModel):
    """Match response model."""
    match_id: int
    results: List[PersonPreview]
    credit_cost: int
    token_usage: Dict[str, int]
    status: str


class RevealResponse(BaseModel):
    """Reveal response model."""
    match_id: int
    results: List[PersonRevealed]


def mask_company_name(name: str) -> str:
    """Mask company name for preview."""
    if len(name) <= 3:
        return "*" * len(name)
    
    return name[0] + "*" * (len(name) - 2) + name[-1]


def blur_text(text: str, max_words: int = 10) -> str:
    """Blur text content for preview."""
    words = text.split()[:max_words]
    return " ".join(words) + "..." if len(text.split()) > max_words else " ".join(words)


@router.post("/match", response_model=MatchResponse)
async def create_match(
    request: MatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new match request with preview results."""
    logger.info(f"Match request from user {current_user.id}: {request.query[:100]}...")
    
    try:
        # Get user context including company info
        user_context = {
            "user_id": current_user.id,
            "email": current_user.email,
            "company": None
        }
        
        if current_user.company:
            user_context["company"] = {
                "id": current_user.company.id,
                "name": current_user.company.name,
                "domain": current_user.company.domain,
                "description": current_user.company.description,
                "tags": current_user.company.tags
            }
            logger.debug(f"User company context: {current_user.company.name}")
        
        # Get candidate pool from database
        candidates = await _get_candidates(db, limit=50)
        logger.debug(f"Retrieved {len(candidates)} candidates from database")
        
        if not candidates:
            raise HTTPException(
                status_code=404,
                detail="No candidates found in database"
            )
        
        # Use LLM to generate matches
        recommendations, token_usage = await llm_service.generate_matches(
            query=request.query,
            user_context=user_context,
            candidates=candidates
        )
        
        logger.info(f"LLM generated {len(recommendations)} recommendations")
        
        # Assess credit cost
        credit_cost = await llm_service.assess_credit_cost(request.query)
        logger.debug(f"Assessed credit cost: {credit_cost}")
        
        # Create match record
        match = Match(
            user_id=current_user.id,
            query_text=request.query,
            llm_model="gemini-1.5-flash",  # From config
            token_prompt=token_usage["prompt"],
            token_completion=token_usage["completion"],
            token_total=token_usage["total"],
            credit_cost=credit_cost,
            status="preview"
        )
        
        db.add(match)
        db.flush()  # Get the match ID
        
        # Create match results
        preview_results = []
        for rec in recommendations[:request.max_results]:
            # Get person and company details
            person = db.query(Person).filter(Person.id == rec["person_id"]).first()
            if not person:
                continue
                
            company = person.company
            
            # Use generated email or fallback to person's email
            generated_email = rec.get("email_address")
            email_to_use = generated_email or person.email_plain or f"{person.full_name.lower().replace(' ', '.')}@{company.name.lower().replace(' ', '')}.com"
            
            # Create match result record
            match_result = MatchResult(
                match_id=match.id,
                person_id=person.id,
                company_id=company.id,
                score=rec["score"],
                reason=rec["reason"],
                email_draft=rec["email_draft"],
                email_masked=person.email_masked or email_to_use.replace(email_to_use.split('@')[0], "***") if email_to_use else "***@***.***",
                email_plain=email_to_use
            )
            
            db.add(match_result)
            
            # Create preview response (masked/blurred)
            preview_result = PersonPreview(
                id=person.id,
                name=person.full_name,
                title=person.title,
                company_name=mask_company_name(company.name),
                company_blurred=True,
                email_masked=match_result.email_masked,
                reason=rec["reason"][:200] + "..." if len(rec["reason"]) > 200 else rec["reason"],
                email_draft_blurred=True,
                score=rec["score"]
            )
            
            preview_results.append(preview_result)
        
        db.commit()
        
        # Log usage
        usage_log = UsageLog(
            user_id=current_user.id,
            kind="api_call",
            amount=1,
            tokens_prompt=token_usage["prompt"],
            tokens_completion=token_usage["completion"],
            llm_model="gemini-1.5-flash"
        )
        db.add(usage_log)
        db.commit()
        
        logger.info(f"Created match {match.id} with {len(preview_results)} results")
        
        return MatchResponse(
            match_id=match.id,
            results=preview_results,
            credit_cost=credit_cost,
            token_usage=token_usage,
            status="preview"
        )
        
    except Exception as e:
        logger.error(f"Match creation failed: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create match: {str(e)}"
        )


@router.post("/reveal/{match_id}", response_model=RevealResponse)
async def reveal_match(
    match_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reveal full match details after payment/credit deduction."""
    logger.info(f"Reveal request from user {current_user.id} for match {match_id}")
    
    # Get match record
    match = db.query(Match).filter(
        and_(Match.id == match_id, Match.user_id == current_user.id)
    ).first()
    
    if not match:
        raise HTTPException(
            status_code=404,
            detail="Match not found"
        )
    
    # Check if already revealed
    if match.status == "revealed":
        logger.info(f"Match {match_id} already revealed, returning cached results")
        return await _get_revealed_results(match, db)
    
    # Check if user has access (subscription or credits)
    if match.status == "preview":
        can_reveal = False
        deduction_method = None
        
        # Check if user has active subscription
        if current_user.is_subscribed():
            can_reveal = True
            deduction_method = "subscription"
            logger.info(f"User {current_user.id} accessing via active subscription: {current_user.subscription_status}")
        
        # If no subscription, check credits
        elif current_user.credits_balance >= match.credit_cost:
            can_reveal = True
            deduction_method = "credits"
            logger.info(f"User {current_user.id} has sufficient credits: {current_user.credits_balance} >= {match.credit_cost}")
        
        if can_reveal:
            # Only deduct credits if not using subscription
            if deduction_method == "credits":
                current_user.credits_balance -= match.credit_cost
                
                # Log credit usage
                usage_log = UsageLog(
                    user_id=current_user.id,
                    kind="contact_reveal",
                    amount=match.credit_cost
                )
                db.add(usage_log)
                
                logger.info(f"Deducted {match.credit_cost} credits from user {current_user.id}")
            
            # Update match status
            match.status = "revealed"
            
        else:
            # Check if subscription expired
            subscription_msg = ""
            if current_user.subscription_status:
                if current_user.subscription_status == 'past_due':
                    subscription_msg = " Your subscription payment is past due."
                elif current_user.subscription_status == 'canceled':
                    subscription_msg = " Your subscription has been canceled."
                else:
                    subscription_msg = f" Your subscription status: {current_user.subscription_status}."
            
            raise HTTPException(
                status_code=402,
                detail=f"Insufficient credits and no active subscription.{subscription_msg} Please purchase credits or upgrade your plan."
            )
    
    # Update revealed timestamp for all match results
    from datetime import datetime
    match_results = db.query(MatchResult).filter(MatchResult.match_id == match_id).all()
    for result in match_results:
        result.revealed_at = datetime.utcnow()
    
    db.commit()
    
    logger.info(f"Revealed match {match_id} for user {current_user.id}")
    
    return await _get_revealed_results(match, db)


async def _get_revealed_results(match: Match, db: Session) -> RevealResponse:
    """Get revealed match results."""
    match_results = db.query(MatchResult).filter(MatchResult.match_id == match.id).all()
    
    revealed_results = []
    for result in match_results:
        person = result.person
        company = person.company
        
        revealed_result = PersonRevealed(
            id=person.id,
            name=person.full_name,
            title=person.title,
            company_name=company.name,
            company_id=company.id,
            email=result.email_plain or person.email_plain or "contact@company.com",
            reason=result.reason,
            email_draft=result.email_draft,
            score=result.score
        )
        
        revealed_results.append(revealed_result)
    
    return RevealResponse(
        match_id=match.id,
        results=revealed_results
    )


async def _get_candidates(db: Session, limit: int = 50) -> List[Dict[str, Any]]:
    """Get candidate pool from database."""
    candidates = []
    
    # Query people with their companies
    people = (
        db.query(Person, Company)
        .join(Company, Person.company_id == Company.id)
        .limit(limit)
        .all()
    )
    
    for person, company in people:
        # Convert comma-separated strings back to lists for LLM
        role_tags = person.role_tags.split(",") if person.role_tags else []
        territories = person.territories.split(",") if person.territories else []
        
        candidate = {
            "id": person.id,
            "full_name": person.full_name,
            "title": person.title or "Professional",
            "company_id": company.id,
            "company_name": company.name,
            "role_tags": role_tags,
            "territories": territories,
            "is_decision_maker": person.is_decision_maker,
            "company_description": company.description,
            "company_tags": company.tags or "{}"
        }
        candidates.append(candidate)
    
    logger.debug(f"Retrieved {len(candidates)} candidates from database")
    return candidates


@router.get("/history")
async def get_match_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's match history."""
    matches = (
        db.query(Match)
        .filter(Match.user_id == current_user.id)
        .order_by(Match.created_at.desc())
        .limit(50)
        .all()
    )
    
    history = []
    for match in matches:
        result_count = db.query(MatchResult).filter(MatchResult.match_id == match.id).count()
        
        history_item = {
            "id": match.id,
            "query": match.query_text[:100] + "..." if len(match.query_text) > 100 else match.query_text,
            "status": match.status,
            "result_count": result_count,
            "credit_cost": match.credit_cost,
            "created_at": match.created_at,
            "revealed_at": match.match_results[0].revealed_at if match.match_results and match.match_results[0].revealed_at else None
        }
        history.append(history_item)
    
    logger.info(f"Retrieved {len(history)} match history items for user {current_user.id}")
    return {"matches": history}