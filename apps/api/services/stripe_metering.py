"""Stripe metering utilities for session-only ViQi prototype."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from loguru import logger

try:
    import stripe  # type: ignore
except Exception:  # pragma: no cover
    stripe = None


@dataclass
class SubscriptionInfo:
    """Details about a customer's active metered subscription."""

    customer_id: str
    subscription_id: str
    subscription_item_id: str
    price_id: str
    plan_name: Optional[str]
    included_credits: int
    current_period_start: Optional[int]
    current_period_end: Optional[int]


@dataclass
class UsageSummary:
    """Stripe usage summary for a metered subscription item."""

    used: int
    pending: int
    period_start: Optional[int]
    period_end: Optional[int]


def _stripe_available() -> bool:
    return bool(stripe and getattr(stripe, "api_key", None))


def get_subscription_info_for_email(email: str) -> Optional[SubscriptionInfo]:
    """Return metered subscription info for the given customer email."""
    if not (_stripe_available() and email):
        return None

    try:
        customers = stripe.Customer.list(email=email, limit=10)
        now_epoch = int(datetime.now(tz=timezone.utc).timestamp())

        for customer in customers.auto_paging_iter():
            subscriptions = stripe.Subscription.list(
                customer=customer.id,
                status="all",
                limit=10,
                expand=["data.items.data.price"],
            )

            for subscription in subscriptions.auto_paging_iter():
                status = subscription.get("status")
                current_period_end = int(subscription.get("current_period_end") or 0)
                if status not in {"active", "trialing"} or current_period_end <= now_epoch:
                    continue

                items = (subscription.get("items") or {}).get("data") or []
                for item in items:
                    price = item.get("price") or {}
                    recurring = price.get("recurring") or {}
                    if recurring.get("usage_type") != "metered":
                        continue

                    metadata = price.get("metadata") or {}
                    included = int(metadata.get("included_credits") or 0)

                    plan_name = price.get("nickname") or None
                    product_id = price.get("product")

                    info = SubscriptionInfo(
                        customer_id=str(customer.id),
                        subscription_id=str(subscription.get("id")),
                        subscription_item_id=str(item.get("id")),
                        price_id=str(price.get("id")),
                        plan_name=plan_name,
                        included_credits=included,
                        current_period_start=int(subscription.get("current_period_start") or 0),
                        current_period_end=current_period_end,
                    )
                    if not info.plan_name and isinstance(product_id, str):
                        try:
                            product = stripe.Product.retrieve(product_id)
                            info.plan_name = product.get("name")
                        except Exception:
                            info.plan_name = None
                    logger.bind(email=email, subscription_id=info.subscription_id).debug(
                        "Resolved Stripe metered subscription"
                    )
                    return info
    except Exception as exc:  # pragma: no cover - Stripe failures handled gracefully
        logger.warning(f"Stripe subscription lookup failed for {email}: {exc}")

    return None


def record_usage(subscription_item_id: str, quantity: int) -> Optional[Dict[str, Any]]:
    """Record metered usage for a subscription item."""
    if not (_stripe_available() and subscription_item_id and quantity):
        return None

    try:
        record = stripe.SubscriptionItem.create_usage_record(
            subscription_item=subscription_item_id,
            quantity=quantity,
            action="increment",
        )
        logger.bind(subscription_item_id=subscription_item_id, quantity=quantity).info(
            "Recorded Stripe usage"
        )
        return record
    except Exception as exc:  # pragma: no cover
        logger.error(
            "Failed to record Stripe usage",
            subscription_item_id=subscription_item_id,
            quantity=quantity,
            exception=exc,
        )
        return None


def get_usage_summary(subscription_item_id: str) -> UsageSummary:
    """Fetch usage summary for a subscription item.

    Stripe usage summaries are eventually consistent; callers should treat
    the returned values as the last confirmed totals.
    """
    if not (_stripe_available() and subscription_item_id):
        return UsageSummary(used=0, pending=0, period_start=None, period_end=None)

    try:
        summaries = stripe.SubscriptionItem.list_usage_record_summaries(
            subscription_item=subscription_item_id,
            limit=1,
        )
        if summaries and summaries.data:
            summary = summaries.data[0]
            total_usage = int(summary.get("total_usage") or 0)
            invoice_estimated = int(summary.get("invoice_estimated") or 0)
            pending = max(total_usage - invoice_estimated, 0)
            period = summary.get("period") or {}
            return UsageSummary(
                used=total_usage,
                pending=pending,
                period_start=period.get("start"),
                period_end=period.get("end"),
            )
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "Failed to fetch Stripe usage summary",
            subscription_item_id=subscription_item_id,
            exception=exc,
        )

    return UsageSummary(used=0, pending=0, period_start=None, period_end=None)


def project_credit_balances(
    included_credits: int,
    usage_summary: UsageSummary,
    additional_usage: int = 0,
) -> Dict[str, int]:
    """Compute used/remaining/pending credits with an optional additional usage."""
    used = usage_summary.used
    projected_used = used + max(additional_usage, 0)
    pending = usage_summary.pending + max(additional_usage, 0)

    remaining = max(included_credits - used, 0)
    projected_remaining = max(included_credits - projected_used, 0)

    return {
        "used": used,
        "remaining": remaining,
        "pending": pending,
        "projected_used": projected_used,
        "projected_remaining": projected_remaining,
    }


__all__ = [
    "SubscriptionInfo",
    "UsageSummary",
    "get_subscription_info_for_email",
    "record_usage",
    "get_usage_summary",
    "project_credit_balances",
]
