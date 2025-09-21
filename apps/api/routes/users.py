"""Minimal user routes for demo (no database)."""
from __future__ import annotations

import os
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel
from loguru import logger

from routes.matching_poc import _is_paid_customer_by_email

router = APIRouter()


class SubscriptionAccess(BaseModel):
    can_access_premium: bool
    has_credits_or_subscription: bool
    payment_required: bool


class SubscriptionResponse(BaseModel):
    email: str | None = None
    credits_balance: int = 0
    subscription: dict[str, str | None | bool | int] | None = None
    access: SubscriptionAccess


def _has_demo_access(email: str | None) -> bool:
    demo_paid = os.getenv("DEMO_PREMIUM_USERS", "")
    if not email or not demo_paid:
        return False
    return any(item.strip().lower() == email.lower() for item in demo_paid.split(','))


@router.get("/me/subscription", response_model=SubscriptionResponse)
async def get_subscription_status(
    request: Request,
    email: str | None = Query(None, description="Email address to evaluate paid access for"),
) -> SubscriptionResponse:
    """Return subscription status using Stripe lookups (no database)."""
    header_email = request.headers.get("x-user-email") or request.headers.get("X-User-Email")
    resolved_email = email or header_email

    force_access = os.getenv("DEMO_FORCE_PREMIUM", "false").lower() == "true"
    stripe_access = _is_paid_customer_by_email(resolved_email) if resolved_email else False
    demo_access = _has_demo_access(resolved_email)
    has_access = force_access or stripe_access or demo_access
    credits_balance_env = os.getenv("DEMO_CREDITS_BALANCE", "0")
    has_credits = credits_balance_env != "0"

    response = SubscriptionResponse(
        email=resolved_email,
        credits_balance=int(credits_balance_env),
        subscription={
            "is_subscribed": has_access,
            "status": "active" if has_access else "inactive",
            "plan_id": os.getenv("DEMO_PLAN_ID"),
            "expires_at": None,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
        },
        access=SubscriptionAccess(
            can_access_premium=has_access,
            has_credits_or_subscription=has_access or has_credits,
            payment_required=not has_access,
        ),
    )

    logger.bind(
        email=resolved_email,
        force_access=force_access,
        stripe_access=stripe_access,
        demo_access=demo_access,
        has_access=has_access,
    ).info("Returning subscription access state")
    return response
