"""Payment routes (demo-friendly, Stripe optional)."""
from __future__ import annotations

import os
import re
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

try:
    import stripe  # type: ignore
except Exception:  # pragma: no cover
    stripe = None

router = APIRouter()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
if stripe and STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY
    logger.info("Stripe configured for checkout sessions")
else:
    logger.warning("Stripe secret key not found. Using demo checkout flow.")


class CreateCheckoutRequest(BaseModel):
    """Minimal checkout request."""
    plan_name: str
    billing_cycle: str = "monthly"  # monthly or annual
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    customer_email: Optional[str] = None
    price_id: Optional[str] = None


class PlanResponse(BaseModel):
    id: int
    name: str
    monthly_price_cents: int
    annual_price_cents: int
    included_credits: int
    overage_price_cents: int
    currency: str
    monthly_price_display: str
    annual_price_display: str
    stripe_monthly_price_id: Optional[str] = None
    stripe_annual_price_id: Optional[str] = None


STATIC_PLAN_CONFIG: List[Dict[str, Any]] = [
    {
        "name": "Starter",
        "monthly_price_cents": 2900,
        "annual_price_cents": 29000,
        "included_credits": 50,
        "overage_price_cents": 100,
        "currency": "USD",
        "stripe_monthly_env": "STRIPE_PRICE_ID_STARTER_MONTHLY",
        "stripe_annual_env": "STRIPE_PRICE_ID_STARTER_ANNUAL",
    },
    {
        "name": "Pro",
        "monthly_price_cents": 7900,
        "annual_price_cents": 79000,
        "included_credits": 200,
        "overage_price_cents": 80,
        "currency": "USD",
        "stripe_monthly_env": "STRIPE_PRICE_ID_PRO_MONTHLY",
        "stripe_annual_env": "STRIPE_PRICE_ID_PRO_ANNUAL",
    },
]


def format_price(cents: Optional[int], currency: str = "USD") -> str:
    if cents is None:
        return "-"
    if currency.upper() == "USD":
        return f"${cents / 100:.0f}"
    return f"{cents / 100:.0f} {currency}"


@router.get("/plans")
async def get_plans() -> Dict[str, Any]:
    """Return subscription plans. Uses Stripe prices if configured, otherwise static data."""
    plans: List[PlanResponse] = []

    # Attempt to fetch live Stripe prices
    if stripe and STRIPE_SECRET_KEY:
        try:
            stripe_prices = stripe.Price.list(active=True, expand=["data.product"], limit=100)
            plans_from_stripe = _build_plans_from_stripe(stripe_prices)
            if plans_from_stripe:
                logger.info(f"Serving {len(plans_from_stripe)} plans from Stripe")
                return {"plans": plans_from_stripe, "geo_group": "stripe"}
        except Exception as exc:  # pragma: no cover
            logger.warning(f"Failed to fetch plans from Stripe: {exc}")

    for idx, plan_cfg in enumerate(STATIC_PLAN_CONFIG, start=1):
        monthly_price_id = os.getenv(plan_cfg["stripe_monthly_env"])
        annual_price_id = os.getenv(plan_cfg["stripe_annual_env"])
        plan = PlanResponse(
            id=idx,
            name=plan_cfg["name"],
            monthly_price_cents=plan_cfg["monthly_price_cents"],
            annual_price_cents=plan_cfg["annual_price_cents"],
            included_credits=plan_cfg["included_credits"],
            overage_price_cents=plan_cfg["overage_price_cents"],
            currency=plan_cfg["currency"],
            monthly_price_display=format_price(plan_cfg["monthly_price_cents"], plan_cfg["currency"]),
            annual_price_display=format_price(plan_cfg["annual_price_cents"], plan_cfg["currency"]),
            stripe_monthly_price_id=monthly_price_id,
            stripe_annual_price_id=annual_price_id,
        )
        plans.append(plan)

    logger.info("Serving static plan configuration")
    return {"plans": plans, "geo_group": "default"}


def _build_plans_from_stripe(price_list: Any) -> List[PlanResponse]:
    plans_by_product: Dict[str, Dict[str, Any]] = {}

    for price in price_list.auto_paging_iter():
        if price.get("type") != "recurring":
            continue

        product = price.get("product")
        if isinstance(product, str):
            try:
                product = stripe.Product.retrieve(product)
            except Exception as exc:  # pragma: no cover
                logger.warning(f"Unable to retrieve Stripe product {product}: {exc}")
                continue

        metadata = (product.get("metadata") or {}) if product else {}
        product_id = product.get("id") if product else None
        if not product_id:
            continue

        entry = plans_by_product.setdefault(product_id, {
            "name": product.get("name", "Stripe Plan"),
            "currency": price.get("currency", "usd").upper(),
            "monthly_price_cents": None,
            "annual_price_cents": None,
            "included_credits": int(metadata.get("included_credits") or 0),
            "overage_price_cents": int(metadata.get("overage_price_cents") or 0),
            "stripe_monthly_price_id": None,
            "stripe_annual_price_id": None,
        })

        interval = (price.get("recurring") or {}).get("interval")
        amount = price.get("unit_amount")

        if interval == "month":
            entry["monthly_price_cents"] = amount
            entry["stripe_monthly_price_id"] = price.get("id")
        elif interval == "year":
            entry["annual_price_cents"] = amount
            entry["stripe_annual_price_id"] = price.get("id")

    plans: List[PlanResponse] = []
    for idx, entry in enumerate(plans_by_product.values(), start=1):
        monthly = entry["monthly_price_cents"]
        annual = entry["annual_price_cents"]

        if monthly is None and annual is None:
            continue

        if monthly is None and annual is not None:
            monthly = annual // 12
        if annual is None and monthly is not None:
            annual = monthly * 12

        plans.append(PlanResponse(
            id=idx,
            name=entry["name"],
            monthly_price_cents=monthly or 0,
            annual_price_cents=annual or 0,
            included_credits=entry["included_credits"],
            overage_price_cents=entry["overage_price_cents"],
            currency=entry["currency"],
            monthly_price_display=format_price(monthly, entry["currency"]),
            annual_price_display=format_price(annual, entry["currency"]),
            stripe_monthly_price_id=entry["stripe_monthly_price_id"],
            stripe_annual_price_id=entry["stripe_annual_price_id"],
        ))

    return plans


@router.post("/checkout")
async def create_checkout_session(payload: CreateCheckoutRequest) -> Dict[str, Any]:
    """Create a Stripe Checkout session or return demo URL."""
    demo_url = os.getenv("STRIPE_CHECKOUT_DEMO_URL", "https://dashboard.stripe.com/test/payments")

    if not (stripe and STRIPE_SECRET_KEY):
        logger.info("Stripe not configured; returning demo checkout URL")
        return {"checkout_url": demo_url, "session_id": "demo-session"}

    price_id = payload.price_id or _resolve_price_id(payload.plan_name, payload.billing_cycle)
    if not price_id:
        logger.warning("No Stripe price ID configured for plan %s (%s)", payload.plan_name, payload.billing_cycle)
        return {"checkout_url": demo_url, "session_id": "demo-session"}

    success_url = payload.success_url or f"{os.getenv('NEXTAUTH_URL', 'http://localhost:3000')}/reveal"
    cancel_url = payload.cancel_url or f"{os.getenv('NEXTAUTH_URL', 'http://localhost:3000')}/paywall"

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=f"{success_url}?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=cancel_url,
            customer_email=payload.customer_email,
        )
        logger.info("Stripe checkout session created: %s", session.id)
        return {"checkout_url": session.url, "session_id": session.id}
    except Exception as exc:  # pragma: no cover
        logger.error(f"Failed to create Stripe checkout session: {exc}")
        raise HTTPException(status_code=502, detail="Stripe checkout failed")


def _resolve_price_id(plan_name: str, billing_cycle: str) -> Optional[str]:
    """Resolve the Stripe price ID from environment variables."""

    billing = billing_cycle.upper()
    # Normalise plan names coming from Stripe (e.g. "ViQi Starter Plan") so
    # they can map to environment variable keys.
    sanitized = re.sub(r"[^A-Z0-9]+", "_", plan_name.upper()).strip("_")

    candidates: List[str] = [f"STRIPE_PRICE_ID_{sanitized}_{billing}"]

    # Support legacy keys that omitted the trailing "_PLAN" or used only the
    # first/last word of the plan name.
    if sanitized.endswith("_PLAN"):
        candidates.append(f"STRIPE_PRICE_ID_{sanitized[:-5]}_{billing}")

    words = [word for word in sanitized.split("_") if word]
    if words:
        # Consider each individual word (e.g. ``STARTER``) as well as the
        # first and last entries for backwards compatibility.
        for word in words:
            candidates.append(f"STRIPE_PRICE_ID_{word}_{billing}")

        candidates.append(f"STRIPE_PRICE_ID_{words[0]}_{billing}")
        candidates.append(f"STRIPE_PRICE_ID_{words[-1]}_{billing}")

    for env_key in dict.fromkeys(candidates):  # Preserve order while deduping
        value = os.getenv(env_key)
        if value:
            logger.debug("Resolved Stripe price ID using env var %s", env_key)
            return value

    return None


@router.post("/purchase-credits")
async def purchase_credits() -> Dict[str, Any]:
    logger.info("Credit purchase endpoint hit (demo mode)")
    raise HTTPException(status_code=501, detail="Credit purchase not implemented in demo mode")


@router.post("/verify/{session_id}")
async def verify_payment(session_id: str) -> Dict[str, Any]:
    logger.info("Verifying payment session %s (demo mode)", session_id)
    return {"success": False, "message": "Verification not implemented in demo mode"}


@router.post("/webhook")
async def stripe_webhook() -> Dict[str, Any]:
    logger.info("Received Stripe webhook (ignored in demo mode)")
    return {"status": "ignored"}
