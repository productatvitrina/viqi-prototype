"""Payment routes for Stripe integration."""
import os
import stripe
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from loguru import logger

from config.database import get_db
from models.models import User, Plan, Payment, PricingGeo, UsageLog
from routes.auth import get_current_user

router = APIRouter()

# Configure Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# Debug: Print if Stripe key is loaded
if not stripe.api_key:
    logger.error("STRIPE_SECRET_KEY not found in environment variables!")
else:
    logger.info(f"Stripe initialized with key: {stripe.api_key[:20]}...")


class CreateCheckoutRequest(BaseModel):
    """Create checkout session request."""
    plan_name: str
    billing_cycle: str  # "monthly" or "annual"
    geo_group: Optional[str] = "default"


class CreditPurchaseRequest(BaseModel):
    """Credit purchase request."""
    credits: int
    match_id: Optional[int] = None


class PlanResponse(BaseModel):
    """Plan response model."""
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


def get_user_geo_group(request: Request) -> str:
    """Determine user's geo group from request."""
    # Try to get country from headers (Vercel, CloudFlare, etc.)
    country = None
    
    # Check various headers
    headers_to_check = [
        "x-vercel-ip-country",
        "cf-ipcountry", 
        "x-country-code",
        "x-forwarded-country"
    ]
    
    for header in headers_to_check:
        country = request.headers.get(header)
        if country:
            break
    
    logger.debug(f"Detected country from headers: {country}")
    
    # Default to "default" if no country detected
    if not country:
        return "default"
    
    # Map country to geo group (simplified for demo)
    tier1_countries = ["US", "CA", "GB", "AU", "DE", "FR", "NL", "SE", "DK", "NO"]
    tier2_countries = ["ES", "IT", "PT", "JP", "KR", "SG", "HK"]
    
    if country.upper() in tier1_countries:
        return "tier1"
    elif country.upper() in tier2_countries:
        return "tier2"
    else:
        return "default"


def format_price(cents: Optional[int], currency: str = "USD") -> str:
    """Format price in cents to display string."""
    if cents is None:
        return "-"
    if currency.upper() == "USD":
        return f"${cents / 100:.0f}"
    return f"{cents / 100:.0f} {currency}"


def fetch_stripe_plans(geo_group: str) -> List[PlanResponse]:
    """Fetch subscription plans directly from Stripe, if available."""
    if not stripe.api_key:
        logger.warning("Cannot fetch Stripe plans: STRIPE_SECRET_KEY missing")
        return []

    try:
        prices = stripe.Price.list(active=True, expand=["data.product"], limit=100)
    except Exception as exc:
        logger.error(f"Failed to fetch Stripe prices: {exc}")
        return []

    plans_by_product: Dict[str, Dict[str, Any]] = {}

    for price in prices.auto_paging_iter():
        if price.get("type") != "recurring":
            continue

        product = price.get("product")
        if isinstance(product, str):
            try:
                product = stripe.Product.retrieve(product)
            except Exception as exc:
                logger.warning(f"Unable to retrieve product {product}: {exc}")
                continue

        metadata = (product.get("metadata") or {}) if product else {}
        product_geo = (metadata.get("geo_group") or "default").lower()
        if geo_group.lower() not in (product_geo, "default"):
            continue

        currency = price.get("currency", "usd").upper()
        product_id = product.get("id") if product else None
        if not product_id:
            continue

        plan_entry = plans_by_product.setdefault(product_id, {
            "name": product.get("name", "Stripe Plan"),
            "currency": currency,
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
            plan_entry["monthly_price_cents"] = amount
            plan_entry["stripe_monthly_price_id"] = price.get("id")
        elif interval == "year":
            plan_entry["annual_price_cents"] = amount
            plan_entry["stripe_annual_price_id"] = price.get("id")

    plan_responses: List[PlanResponse] = []
    for idx, plan in enumerate(plans_by_product.values(), start=1):
        if plan["monthly_price_cents"] is None and plan["annual_price_cents"] is None:
            continue

        monthly = plan["monthly_price_cents"]
        annual = plan["annual_price_cents"]

        if monthly is None and annual is not None:
            monthly = annual // 12
        if annual is None and monthly is not None:
            annual = monthly * 12

        plan_responses.append(PlanResponse(
            id=idx,
            name=plan["name"],
            monthly_price_cents=monthly or 0,
            annual_price_cents=annual or 0,
            included_credits=plan["included_credits"],
            overage_price_cents=plan["overage_price_cents"],
            currency=plan["currency"],
            monthly_price_display=format_price(monthly, plan["currency"]),
            annual_price_display=format_price(annual, plan["currency"]),
            stripe_monthly_price_id=plan["stripe_monthly_price_id"],
            stripe_annual_price_id=plan["stripe_annual_price_id"]
        ))

    if plan_responses:
        logger.info(f"Returning {len(plan_responses)} Stripe plans for geo group {geo_group}")

    return plan_responses


@router.get("/plans")
async def get_plans(
    request: Request,
    db: Session = Depends(get_db)
):
    """Get available plans for user's geography."""
    geo_group = get_user_geo_group(request)
    logger.debug(f"Getting plans for geo group: {geo_group}")

    stripe_plans = fetch_stripe_plans(geo_group)
    if stripe_plans:
        return {
            "plans": stripe_plans,
            "geo_group": geo_group
        }
    
    plans = db.query(Plan).filter(
        Plan.geo_group == geo_group,
        Plan.is_active == True
    ).all()
    
    if not plans:
        # Fallback to default plans
        plans = db.query(Plan).filter(
            Plan.geo_group == "default",
            Plan.is_active == True
        ).all()
    
    plan_responses = []
    for plan in plans:
        # Get Stripe price IDs if they exist
        monthly_price_id = getattr(plan, 'stripe_monthly_price_id', None)
        annual_price_id = getattr(plan, 'stripe_annual_price_id', None)
        
        plan_response = PlanResponse(
            id=plan.id,
            name=plan.name,
            monthly_price_cents=plan.monthly_price_cents,
            annual_price_cents=plan.annual_price_cents,
            included_credits=plan.included_credits,
            overage_price_cents=plan.overage_price_cents,
            currency=plan.currency,
            monthly_price_display=format_price(plan.monthly_price_cents, plan.currency),
            annual_price_display=format_price(plan.annual_price_cents, plan.currency),
            stripe_monthly_price_id=monthly_price_id,
            stripe_annual_price_id=annual_price_id
        )
        plan_responses.append(plan_response)
    
    logger.info(f"Retrieved {len(plan_responses)} plans for geo group {geo_group}")
    
    return {
        "plans": plan_responses,
        "geo_group": geo_group
    }


@router.post("/checkout")
async def create_checkout_session(
    request_data: CreateCheckoutRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create Stripe Checkout session."""
    logger.info(f"Creating checkout session for user {current_user.id}")
    
    try:
        # Get the plan
        geo_group = request_data.geo_group or get_user_geo_group(request)
        
        plan = db.query(Plan).filter(
            Plan.name == request_data.plan_name,
            Plan.geo_group == geo_group,
            Plan.is_active == True
        ).first()
        
        if not plan:
            # Try default geo group
            plan = db.query(Plan).filter(
                Plan.name == request_data.plan_name,
                Plan.geo_group == "default",
                Plan.is_active == True
            ).first()
        
        if not plan:
            raise HTTPException(
                status_code=404,
                detail=f"Plan not found: {request_data.plan_name}"
            )
        
        # Determine price based on billing cycle
        if request_data.billing_cycle == "annual":
            price_cents = plan.annual_price_cents
            credits = plan.included_credits * 12  # Annual includes 12 months of credits
        else:
            price_cents = plan.monthly_price_cents
            credits = plan.included_credits
        
        # Get the appropriate Stripe price ID
        stripe_price_id = None
        try:
            if request_data.billing_cycle == "annual":
                stripe_price_id = plan.stripe_annual_price_id
            else:
                stripe_price_id = plan.stripe_monthly_price_id
        except AttributeError:
            # Fallback if price ID columns don't exist
            stripe_price_id = None
        
        # Create or get Stripe customer
        customer = None
        if current_user.stripe_customer_id:
            try:
                customer = stripe.Customer.retrieve(current_user.stripe_customer_id)
            except stripe.error.InvalidRequestError:
                logger.warning(f"Stripe customer {current_user.stripe_customer_id} not found, creating new one")
                customer = None
        
        if not customer:
            customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.name,
                metadata={'user_id': str(current_user.id)}
            )
            # Update user with customer ID
            current_user.stripe_customer_id = customer.id
            db.commit()
            logger.info(f"Created Stripe customer {customer.id} for user {current_user.id}")

        # Create Stripe checkout session using real price IDs
        if stripe_price_id:
            checkout_session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price': stripe_price_id,
                    'quantity': 1,
                }],
                mode='subscription',  # Changed to subscription mode for recurring plans
                success_url=f"{os.getenv('NEXTAUTH_URL', 'http://localhost:3000')}/reveal?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{os.getenv('NEXTAUTH_URL', 'http://localhost:3000')}/paywall",
                customer=customer.id,
                metadata={
                    'user_id': str(current_user.id),
                    'plan_id': str(plan.id),
                    'billing_cycle': request_data.billing_cycle,
                    'credits': str(credits)
                }
            )
        else:
            # Fallback to old method if no price ID
            checkout_session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': plan.currency.lower(),
                        'product_data': {
                            'name': f'ViQi {plan.name} Plan ({request_data.billing_cycle.title()})',
                            'description': f'{credits} credits included'
                        },
                        'unit_amount': price_cents,
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url=f"{os.getenv('NEXTAUTH_URL', 'http://localhost:3000')}/reveal?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{os.getenv('NEXTAUTH_URL', 'http://localhost:3000')}/paywall",
                customer=customer.id,
                metadata={
                    'user_id': str(current_user.id),
                    'plan_id': str(plan.id),
                    'billing_cycle': request_data.billing_cycle,
                    'credits': str(credits)
                }
            )
        
        # Create pending payment record
        payment = Payment(
            user_id=current_user.id,
            stripe_checkout_id=checkout_session.id,
            plan_id=plan.id,
            amount_cents=price_cents,
            currency=plan.currency,
            status="pending",
            credits_purchased=credits
        )
        
        db.add(payment)
        db.commit()
        
        logger.info(f"Created checkout session {checkout_session.id} for user {current_user.id}")
        
        return {
            "checkout_url": checkout_session.url,
            "session_id": checkout_session.id
        }
        
    except stripe.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Payment error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Checkout creation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create checkout session"
        )


@router.post("/purchase-credits")
async def purchase_credits(
    request_data: CreditPurchaseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Purchase additional credits."""
    logger.info(f"Credit purchase request from user {current_user.id}: {request_data.credits} credits")
    
    try:
        # Get default plan for overage pricing
        default_plan = db.query(Plan).filter(
            Plan.name == "Starter",
            Plan.geo_group == "default"
        ).first()
        
        if not default_plan:
            raise HTTPException(
                status_code=500,
                detail="Pricing configuration error"
            )
        
        # Calculate price
        price_per_credit = default_plan.overage_price_cents
        total_price_cents = request_data.credits * price_per_credit
        
        # Create Stripe checkout session
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': f'ViQi Credits ({request_data.credits} credits)',
                        'description': 'Additional credits for ViQi platform'
                    },
                    'unit_amount': price_per_credit,
                },
                'quantity': request_data.credits,
            }],
            mode='payment',
            success_url=f"{os.getenv('NEXTAUTH_URL', 'http://localhost:3000')}/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{os.getenv('NEXTAUTH_URL', 'http://localhost:3000')}/dashboard",
            customer_email=current_user.email,
            metadata={
                'user_id': str(current_user.id),
                'credits': str(request_data.credits),
                'match_id': str(request_data.match_id) if request_data.match_id else '',
                'type': 'credit_purchase'
            }
        )
        
        # Create pending payment record
        payment = Payment(
            user_id=current_user.id,
            stripe_checkout_id=checkout_session.id,
            amount_cents=total_price_cents,
            currency="USD",
            status="pending",
            credits_purchased=request_data.credits
        )
        
        db.add(payment)
        db.commit()
        
        logger.info(f"Created credit purchase session {checkout_session.id}")
        
        return {
            "checkout_url": checkout_session.url,
            "session_id": checkout_session.id,
            "total_price_cents": total_price_cents,
            "credits": request_data.credits
        }
        
    except Exception as e:
        logger.error(f"Credit purchase failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create credit purchase"
        )


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """Handle Stripe webhooks."""
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not webhook_secret:
        logger.warning("STRIPE_WEBHOOK_SECRET not configured")
        return JSONResponse(content={"status": "warning", "message": "Webhook secret not configured"})
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
    except ValueError:
        logger.error("Invalid payload in webhook")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        logger.error("Invalid signature in webhook")
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    logger.info(f"Received Stripe webhook: {event['type']}")
    
    # Handle different webhook events
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        await handle_successful_payment(session, db)
    
    elif event['type'] == 'customer.subscription.created':
        subscription = event['data']['object']
        await handle_subscription_created(subscription, db)
    
    elif event['type'] == 'customer.subscription.updated':
        subscription = event['data']['object']
        await handle_subscription_updated(subscription, db)
    
    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        await handle_subscription_deleted(subscription, db)
    
    elif event['type'] == 'invoice.payment_succeeded':
        invoice = event['data']['object']
        await handle_invoice_payment_succeeded(invoice, db)
    
    elif event['type'] == 'invoice.payment_failed':
        invoice = event['data']['object']
        await handle_invoice_payment_failed(invoice, db)
    
    return JSONResponse(content={"status": "success"})


async def handle_successful_payment(session: Dict[str, Any], db: Session):
    """Handle successful payment from Stripe webhook."""
    session_id = session['id']
    user_id = int(session['metadata']['user_id'])
    credits = int(session['metadata']['credits'])
    
    logger.info(f"Processing successful payment for user {user_id}, session {session_id}")
    
    try:
        # Update payment record
        payment = db.query(Payment).filter(
            Payment.stripe_checkout_id == session_id
        ).first()
        
        if payment:
            payment.status = "succeeded"
            payment.stripe_customer_id = session.get('customer')
        
        # Add credits to user
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.credits_balance += credits
            logger.info(f"Added {credits} credits to user {user_id}, new balance: {user.credits_balance}")
        
        # Log the credit addition
        usage_log = UsageLog(
            user_id=user_id,
            kind="credit_purchase",
            amount=credits
        )
        db.add(usage_log)
        
        db.commit()
        
        logger.info(f"Successfully processed payment for user {user_id}")
        
    except Exception as e:
        logger.error(f"Failed to process payment webhook: {e}")
        db.rollback()


@router.post("/verify/{session_id}")
async def verify_stripe_payment(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify Stripe payment completion and update payment status."""
    logger.info(f"Verifying payment session {session_id} for user {current_user.id}")
    
    try:
        # Retrieve the Stripe session
        stripe_session = stripe.checkout.Session.retrieve(session_id)
        
        if stripe_session.payment_status == "paid":
            # Find the payment record
            payment = db.query(Payment).filter(
                Payment.stripe_checkout_id == session_id,
                Payment.user_id == current_user.id
            ).first()
            
            if payment and payment.status == "pending":
                # Update payment status
                payment.status = "completed"
                payment.stripe_customer_id = stripe_session.customer
                
                # Add credits to user account
                current_user.credits_balance += payment.credits_purchased
                
                db.commit()
                logger.info(f"Payment {session_id} completed for user {current_user.id}")
                
                return {
                    "success": True,
                    "message": "Payment verified and processed",
                    "credits_added": payment.credits_purchased,
                    "new_balance": current_user.credits_balance
                }
            else:
                logger.warning(f"Payment record not found or already processed: {session_id}")
                return {"success": False, "message": "Payment already processed"}
        else:
            logger.warning(f"Stripe session {session_id} not paid: {stripe_session.payment_status}")
            return {"success": False, "message": "Payment not completed"}
            
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error verifying session {session_id}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error(f"Error verifying payment {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Payment verification failed")


async def handle_subscription_created(subscription: Dict[str, Any], db: Session):
    """Handle subscription creation webhook."""
    from datetime import datetime
    
    customer_id = subscription['customer']
    subscription_id = subscription['id']
    status = subscription['status']
    
    logger.info(f"Processing subscription created: {subscription_id}")
    
    try:
        # Find user by Stripe customer ID
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        
        if user:
            # Update user subscription info
            user.stripe_subscription_id = subscription_id
            user.subscription_status = status
            user.subscription_created_at = datetime.fromtimestamp(subscription['created'])
            user.subscription_expires_at = datetime.fromtimestamp(subscription['current_period_end'])
            
            # Get plan info from subscription items
            if subscription['items']['data']:
                price_id = subscription['items']['data'][0]['price']['id']
                plan = db.query(Plan).filter(
                    (Plan.stripe_monthly_price_id == price_id) |
                    (Plan.stripe_annual_price_id == price_id)
                ).first()
                
                if plan:
                    user.subscription_plan_id = plan.id
                    logger.info(f"Associated user {user.id} with plan {plan.name}")
            
            db.commit()
            logger.info(f"Updated user {user.id} subscription: {status}")
        else:
            logger.warning(f"User not found for customer ID: {customer_id}")
            
    except Exception as e:
        logger.error(f"Failed to process subscription created webhook: {e}")
        db.rollback()


async def handle_subscription_updated(subscription: Dict[str, Any], db: Session):
    """Handle subscription update webhook."""
    from datetime import datetime
    
    subscription_id = subscription['id']
    status = subscription['status']
    
    logger.info(f"Processing subscription updated: {subscription_id} -> {status}")
    
    try:
        # Find user by subscription ID
        user = db.query(User).filter(User.stripe_subscription_id == subscription_id).first()
        
        if user:
            user.subscription_status = status
            user.subscription_expires_at = datetime.fromtimestamp(subscription['current_period_end'])
            
            db.commit()
            logger.info(f"Updated user {user.id} subscription status: {status}")
        else:
            logger.warning(f"User not found for subscription ID: {subscription_id}")
            
    except Exception as e:
        logger.error(f"Failed to process subscription updated webhook: {e}")
        db.rollback()


async def handle_subscription_deleted(subscription: Dict[str, Any], db: Session):
    """Handle subscription cancellation webhook."""
    subscription_id = subscription['id']
    
    logger.info(f"Processing subscription deleted: {subscription_id}")
    
    try:
        # Find user by subscription ID
        user = db.query(User).filter(User.stripe_subscription_id == subscription_id).first()
        
        if user:
            user.subscription_status = 'canceled'
            user.stripe_subscription_id = None
            user.subscription_expires_at = None
            user.subscription_plan_id = None
            
            db.commit()
            logger.info(f"Canceled subscription for user {user.id}")
        else:
            logger.warning(f"User not found for subscription ID: {subscription_id}")
            
    except Exception as e:
        logger.error(f"Failed to process subscription deleted webhook: {e}")
        db.rollback()


async def handle_invoice_payment_succeeded(invoice: Dict[str, Any], db: Session):
    """Handle successful recurring payment."""
    customer_id = invoice['customer']
    subscription_id = invoice['subscription']
    
    logger.info(f"Processing invoice payment succeeded for subscription: {subscription_id}")
    
    try:
        # Find user by customer ID or subscription ID
        user = db.query(User).filter(
            (User.stripe_customer_id == customer_id) |
            (User.stripe_subscription_id == subscription_id)
        ).first()
        
        if user:
            # If this is a subscription renewal, add credits
            if subscription_id and user.subscription_plan:
                credits_to_add = user.subscription_plan.included_credits
                user.credits_balance += credits_to_add
                
                # Log credit addition
                usage_log = UsageLog(
                    user_id=user.id,
                    kind="subscription_renewal",
                    amount=credits_to_add
                )
                db.add(usage_log)
                
                logger.info(f"Added {credits_to_add} credits to user {user.id} for subscription renewal")
            
            db.commit()
        else:
            logger.warning(f"User not found for customer/subscription: {customer_id}/{subscription_id}")
            
    except Exception as e:
        logger.error(f"Failed to process invoice payment succeeded webhook: {e}")
        db.rollback()


async def handle_invoice_payment_failed(invoice: Dict[str, Any], db: Session):
    """Handle failed recurring payment."""
    customer_id = invoice['customer']
    subscription_id = invoice['subscription']
    
    logger.info(f"Processing invoice payment failed for subscription: {subscription_id}")
    
    try:
        # Find user by customer ID or subscription ID
        user = db.query(User).filter(
            (User.stripe_customer_id == customer_id) |
            (User.stripe_subscription_id == subscription_id)
        ).first()
        
        if user:
            # Update subscription status to past_due
            user.subscription_status = 'past_due'
            
            db.commit()
            logger.info(f"Updated user {user.id} subscription to past_due due to payment failure")
        else:
            logger.warning(f"User not found for customer/subscription: {customer_id}/{subscription_id}")
            
    except Exception as e:
        logger.error(f"Failed to process invoice payment failed webhook: {e}")
        db.rollback()


@router.get("/history")
async def get_payment_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's payment history."""
    payments = (
        db.query(Payment)
        .filter(Payment.user_id == current_user.id)
        .order_by(Payment.created_at.desc())
        .limit(50)
        .all()
    )
    
    payment_history = []
    for payment in payments:
        history_item = {
            "id": payment.id,
            "amount_cents": payment.amount_cents,
            "amount_display": format_price(payment.amount_cents, payment.currency),
            "currency": payment.currency,
            "credits_purchased": payment.credits_purchased,
            "status": payment.status,
            "created_at": payment.created_at,
            "plan_name": payment.plan.name if payment.plan else "Credits"
        }
        payment_history.append(history_item)
    
    logger.info(f"Retrieved {len(payment_history)} payment history items for user {current_user.id}")
    
    return {
        "payments": payment_history,
        "total_spent_cents": sum(p.amount_cents for p in payments if p.status == "succeeded")
    }
