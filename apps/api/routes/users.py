"""User management routes."""
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from loguru import logger

from config.database import get_db
from models.models import User, UsageLog, Match, Payment
from routes.auth import get_current_user

router = APIRouter()


class UsageStats(BaseModel):
    """Usage statistics model."""
    total_queries: int
    total_contacts_revealed: int
    total_tokens_used: int
    total_credits_used: int
    total_spent_cents: int
    queries_this_month: int
    credits_balance: int


class DashboardStats(BaseModel):
    """Dashboard statistics model."""
    user: Dict[str, Any]
    usage: UsageStats
    recent_matches: List[Dict[str, Any]]
    recent_payments: List[Dict[str, Any]]


@router.get("/me/dashboard")
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get comprehensive dashboard statistics for the user."""
    logger.info(f"Fetching dashboard stats for user {current_user.id}")
    
    try:
        # Calculate date ranges
        now = datetime.utcnow()
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Usage statistics from usage_log
        usage_stats = db.query(
            func.count(UsageLog.id).label('total_logs'),
            func.sum(UsageLog.amount).label('total_amount'),
            func.sum(UsageLog.tokens_prompt).label('total_prompt_tokens'),
            func.sum(UsageLog.tokens_completion).label('total_completion_tokens')
        ).filter(UsageLog.user_id == current_user.id).first()
        
        # Queries this month
        queries_this_month = db.query(func.count(Match.id)).filter(
            Match.user_id == current_user.id,
            Match.created_at >= start_of_month
        ).scalar() or 0
        
        # Total queries
        total_queries = db.query(func.count(Match.id)).filter(
            Match.user_id == current_user.id
        ).scalar() or 0
        
        # Contacts revealed (matches with revealed status)
        contacts_revealed = db.query(func.count(Match.id)).filter(
            Match.user_id == current_user.id,
            Match.status == "revealed"
        ).scalar() or 0
        
        # Total spent from payments
        total_spent = db.query(func.sum(Payment.amount_cents)).filter(
            Payment.user_id == current_user.id,
            Payment.status == "succeeded"
        ).scalar() or 0
        
        # Credits used (sum of credit costs from revealed matches)
        credits_used = db.query(func.sum(Match.credit_cost)).filter(
            Match.user_id == current_user.id,
            Match.status == "revealed"
        ).scalar() or 0
        
        # Recent matches (last 5)
        recent_matches = db.query(Match).filter(
            Match.user_id == current_user.id
        ).order_by(Match.created_at.desc()).limit(5).all()
        
        recent_matches_data = []
        for match in recent_matches:
            match_data = {
                "id": match.id,
                "query": match.query_text[:100] + "..." if len(match.query_text) > 100 else match.query_text,
                "status": match.status,
                "credit_cost": match.credit_cost,
                "created_at": match.created_at,
                "token_usage": {
                    "prompt": match.token_prompt,
                    "completion": match.token_completion,
                    "total": match.token_total
                }
            }
            recent_matches_data.append(match_data)
        
        # Recent payments (last 5)
        recent_payments = db.query(Payment).filter(
            Payment.user_id == current_user.id
        ).order_by(Payment.created_at.desc()).limit(5).all()
        
        recent_payments_data = []
        for payment in recent_payments:
            payment_data = {
                "id": payment.id,
                "amount_cents": payment.amount_cents,
                "currency": payment.currency,
                "status": payment.status,
                "credits_purchased": payment.credits_purchased,
                "created_at": payment.created_at,
                "plan_name": payment.plan.name if payment.plan else "Credits"
            }
            recent_payments_data.append(payment_data)
        
        # User info
        user_info = {
            "id": current_user.id,
            "email": current_user.email,
            "name": current_user.name,
            "role": current_user.role,
            "credits_balance": current_user.credits_balance,
            "created_at": current_user.created_at,
            "company": None
        }
        
        if current_user.company:
            user_info["company"] = {
                "id": current_user.company.id,
                "name": current_user.company.name,
                "domain": current_user.company.domain
            }
        
        # Build usage stats
        usage = UsageStats(
            total_queries=total_queries,
            total_contacts_revealed=contacts_revealed,
            total_tokens_used=int((usage_stats.total_prompt_tokens or 0) + (usage_stats.total_completion_tokens or 0)),
            total_credits_used=credits_used or 0,
            total_spent_cents=int(total_spent),
            queries_this_month=queries_this_month,
            credits_balance=current_user.credits_balance
        )
        
        dashboard_data = DashboardStats(
            user=user_info,
            usage=usage,
            recent_matches=recent_matches_data,
            recent_payments=recent_payments_data
        )
        
        logger.info(f"Dashboard stats retrieved for user {current_user.id}")
        return dashboard_data
        
    except Exception as e:
        logger.error(f"Failed to fetch dashboard stats: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch dashboard statistics"
        )


@router.get("/me/usage")
async def get_detailed_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed usage breakdown for the user."""
    logger.info(f"Fetching detailed usage for user {current_user.id}")
    
    # Get usage logs grouped by kind
    usage_by_kind = db.query(
        UsageLog.kind,
        func.count(UsageLog.id).label('count'),
        func.sum(UsageLog.amount).label('total_amount'),
        func.sum(UsageLog.tokens_prompt).label('total_prompt_tokens'),
        func.sum(UsageLog.tokens_completion).label('total_completion_tokens')
    ).filter(
        UsageLog.user_id == current_user.id
    ).group_by(UsageLog.kind).all()
    
    usage_breakdown = {}
    for usage in usage_by_kind:
        usage_breakdown[usage.kind] = {
            "count": usage.count,
            "total_amount": usage.total_amount or 0,
            "total_tokens": (usage.total_prompt_tokens or 0) + (usage.total_completion_tokens or 0)
        }
    
    # Get monthly usage trend (last 6 months)
    six_months_ago = datetime.utcnow() - timedelta(days=180)
    
    monthly_usage = db.query(
        func.date_trunc('month', UsageLog.created_at).label('month'),
        func.count(UsageLog.id).label('count'),
        func.sum(UsageLog.amount).label('total_amount')
    ).filter(
        UsageLog.user_id == current_user.id,
        UsageLog.created_at >= six_months_ago
    ).group_by(func.date_trunc('month', UsageLog.created_at)).order_by('month').all()
    
    monthly_trend = []
    for usage in monthly_usage:
        monthly_trend.append({
            "month": usage.month.strftime("%Y-%m"),
            "count": usage.count,
            "total_amount": usage.total_amount or 0
        })
    
    logger.info(f"Retrieved detailed usage for user {current_user.id}")
    
    return {
        "breakdown_by_type": usage_breakdown,
        "monthly_trend": monthly_trend,
        "current_balance": current_user.credits_balance
    }


@router.post("/me/credits/adjust")
async def adjust_credits(
    credits: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Adjust user credits (admin only or for demo purposes)."""
    # In production, this would be admin-only
    # For demo, we'll allow users to adjust their own credits within limits
    
    if abs(credits) > 100:
        raise HTTPException(
            status_code=400,
            detail="Credit adjustment limited to ±100 for demo"
        )
    
    logger.info(f"Adjusting credits for user {current_user.id}: {credits:+d}")
    
    current_user.credits_balance += credits
    
    # Ensure balance doesn't go negative
    if current_user.credits_balance < 0:
        current_user.credits_balance = 0
    
    # Log the adjustment
    usage_log = UsageLog(
        user_id=current_user.id,
        kind="credit_adjustment",
        amount=credits
    )
    db.add(usage_log)
    
    db.commit()
    
    logger.info(f"Credits adjusted for user {current_user.id}, new balance: {current_user.credits_balance}")
    
    return {
        "new_balance": current_user.credits_balance,
        "adjustment": credits
    }


@router.get("/me/subscription")
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's subscription status and payment info."""
    logger.info(f"Fetching subscription status for user {current_user.id}")
    
    subscription_info = {
        "user_id": current_user.id,
        "email": current_user.email,
        "credits_balance": current_user.credits_balance,
        "subscription": {
            "is_subscribed": current_user.is_subscribed(),
            "status": current_user.subscription_status,
            "plan_id": current_user.subscription_plan_id,
            "expires_at": current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None,
            "stripe_customer_id": current_user.stripe_customer_id,
            "stripe_subscription_id": current_user.stripe_subscription_id
        },
        "access": {
            "can_access_premium": current_user.can_access_premium_features(),
            "has_credits_or_subscription": current_user.has_credits_or_subscription(),
            "payment_required": not current_user.has_credits_or_subscription()
        }
    }
    
    logger.info(f"Subscription status: user {current_user.id}, subscribed: {current_user.is_subscribed()}, credits: {current_user.credits_balance}")
    return subscription_info


@router.get("/me/export")
async def export_user_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export user data (GDPR compliance stub)."""
    logger.info(f"Data export requested for user {current_user.id}")
    
    # Get all user data
    matches = db.query(Match).filter(Match.user_id == current_user.id).all()
    payments = db.query(Payment).filter(Payment.user_id == current_user.id).all()
    usage_logs = db.query(UsageLog).filter(UsageLog.user_id == current_user.id).all()
    
    export_data = {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "name": current_user.name,
            "created_at": current_user.created_at.isoformat(),
            "credits_balance": current_user.credits_balance
        },
        "matches": [
            {
                "id": match.id,
                "query": match.query_text,
                "status": match.status,
                "created_at": match.created_at.isoformat()
            }
            for match in matches
        ],
        "payments": [
            {
                "id": payment.id,
                "amount_cents": payment.amount_cents,
                "currency": payment.currency,
                "status": payment.status,
                "created_at": payment.created_at.isoformat()
            }
            for payment in payments
        ],
        "usage_summary": {
            "total_api_calls": len([log for log in usage_logs if log.kind == "api_call"]),
            "total_reveals": len([log for log in usage_logs if log.kind == "contact_reveal"]),
            "total_tokens": sum(log.tokens_prompt + log.tokens_completion for log in usage_logs if log.tokens_prompt)
        }
    }
    
    logger.info(f"Data export prepared for user {current_user.id}")
    return export_data


@router.delete("/me")
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete user account (GDPR compliance stub)."""
    logger.warning(f"Account deletion requested for user {current_user.id}")
    
    # In production, this would:
    # 1. Cancel active subscriptions
    # 2. Delete/anonymize user data
    # 3. Send confirmation email
    
    # For demo, we'll just return a placeholder response
    return {
        "message": "Account deletion requested. In production, this would process the deletion within 30 days.",
        "status": "pending",
        "user_id": current_user.id
    }
