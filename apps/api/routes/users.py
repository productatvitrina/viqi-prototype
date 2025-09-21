"""Minimal user routes for demo (no database)."""
from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from loguru import logger

from services.stripe_metering import (
    get_subscription_info_for_email,
    get_usage_summary,
    project_credit_balances,
)

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
    credit_summary: Optional[dict[str, int | None | str]] = None


class CreditSummaryResponse(BaseModel):
    """Stripe credit summary returned to the frontend."""

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
    subscription_info = (
        get_subscription_info_for_email(resolved_email) if resolved_email else None
    )
    stripe_access = bool(subscription_info)
    demo_access = _has_demo_access(resolved_email)
    has_access = force_access or stripe_access or demo_access
    credits_balance_env = os.getenv("DEMO_CREDITS_BALANCE", "0")
    has_credits = credits_balance_env != "0"

    credit_summary_payload = None
    if subscription_info:
        usage_summary = get_usage_summary(subscription_info.subscription_item_id)
        balances = project_credit_balances(
            included_credits=subscription_info.included_credits,
            usage_summary=usage_summary,
        )
        credit_summary_payload = CreditSummaryResponse(
            included_credits=subscription_info.included_credits,
            used_credits=balances["used"],
            remaining_credits=balances["remaining"],
            pending_credits=balances["pending"],
            projected_used_credits=balances["projected_used"],
            projected_remaining_credits=balances["projected_remaining"],
            stripe_customer_id=subscription_info.customer_id,
            stripe_subscription_id=subscription_info.subscription_id,
            stripe_subscription_item_id=subscription_info.subscription_item_id,
            period_start=usage_summary.period_start,
            period_end=usage_summary.period_end,
        ).dict()

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
        credit_summary=credit_summary_payload,
    )

    logger.bind(
        email=resolved_email,
        force_access=force_access,
        stripe_access=stripe_access,
        demo_access=demo_access,
        has_access=has_access,
    ).info("Returning subscription access state")
    return response


@router.get("/me/credits", response_model=CreditSummaryResponse)
async def get_credit_summary(
    request: Request,
    email: str | None = Query(None, description="Email address to fetch credit usage for"),
) -> CreditSummaryResponse:
    """Expose current credit usage using Stripe metered data."""

    header_email = request.headers.get("x-user-email") or request.headers.get("X-User-Email")
    resolved_email = email or header_email
    if not resolved_email:
        raise HTTPException(status_code=400, detail="Email is required for credit lookup")

    subscription_info = get_subscription_info_for_email(resolved_email)
    if not subscription_info:
        raise HTTPException(status_code=404, detail="No metered subscription found for user")

    usage_summary = get_usage_summary(subscription_info.subscription_item_id)
    balances = project_credit_balances(
        included_credits=subscription_info.included_credits,
        usage_summary=usage_summary,
    )

    logger.bind(email=resolved_email).info("Returning credit summary")

    return CreditSummaryResponse(
        included_credits=subscription_info.included_credits,
        used_credits=balances["used"],
        remaining_credits=balances["remaining"],
        pending_credits=balances["pending"],
        projected_used_credits=balances["projected_used"],
        projected_remaining_credits=balances["projected_remaining"],
        stripe_customer_id=subscription_info.customer_id,
        stripe_subscription_id=subscription_info.subscription_id,
        stripe_subscription_item_id=subscription_info.subscription_item_id,
        period_start=usage_summary.period_start,
        period_end=usage_summary.period_end,
    )
