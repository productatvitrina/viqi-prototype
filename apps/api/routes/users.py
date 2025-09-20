"""Minimal user routes for demo (no database)."""
from __future__ import annotations

import os
from fastapi import APIRouter
from pydantic import BaseModel
from loguru import logger

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
async def get_subscription_status() -> SubscriptionResponse:
    """Return demo subscription status based on env configuration."""
    email = None
    force_access = os.getenv("DEMO_FORCE_PREMIUM", "false").lower() == "true"
    has_access = force_access or _has_demo_access(email)

    response = SubscriptionResponse(
        email=email,
        credits_balance=int(os.getenv("DEMO_CREDITS_BALANCE", "0")),
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
            has_credits_or_subscription=has_access or os.getenv("DEMO_CREDITS_BALANCE", "0") != "0",
            payment_required=not has_access,
        ),
    )

    logger.info("Returning demo subscription status: %s", response.access)
    return response
