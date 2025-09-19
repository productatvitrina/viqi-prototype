"""Subscription service for managing subscription status and expiry checks."""
import os
import stripe
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from loguru import logger

from models.models import User, Plan
from config.database import get_db


class SubscriptionService:
    """Service for managing user subscriptions."""

    def __init__(self):
        """Initialize the subscription service."""
        stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

    async def check_subscription_expiry(self, user: User, db: Session) -> Dict[str, Any]:
        """
        Check if user's subscription is expired or expiring soon.
        
        Returns:
            Dict with status, expires_in_days, and action_needed
        """
        if not user.subscription_expires_at:
            return {
                "status": "no_subscription",
                "expires_in_days": None,
                "action_needed": False,
                "message": "No active subscription"
            }

        now = datetime.utcnow()
        expires_at = user.subscription_expires_at
        time_until_expiry = expires_at - now

        # Check if already expired
        if time_until_expiry.total_seconds() <= 0:
            return {
                "status": "expired",
                "expires_in_days": 0,
                "action_needed": True,
                "message": "Subscription has expired"
            }

        days_until_expiry = time_until_expiry.days

        # Check if expiring within 7 days
        if days_until_expiry <= 7:
            return {
                "status": "expiring_soon",
                "expires_in_days": days_until_expiry,
                "action_needed": True,
                "message": f"Subscription expires in {days_until_expiry} days"
            }

        # Check if expiring within 30 days
        if days_until_expiry <= 30:
            return {
                "status": "expiring_within_month",
                "expires_in_days": days_until_expiry,
                "action_needed": False,
                "message": f"Subscription expires in {days_until_expiry} days"
            }

        return {
            "status": "active",
            "expires_in_days": days_until_expiry,
            "action_needed": False,
            "message": f"Subscription active for {days_until_expiry} more days"
        }

    async def sync_subscription_from_stripe(self, user: User, db: Session) -> Dict[str, Any]:
        """
        Sync user's subscription status from Stripe.
        
        Returns:
            Dict with sync status and updated subscription info
        """
        if not user.stripe_customer_id:
            return {
                "success": False,
                "message": "No Stripe customer ID found",
                "subscription": None
            }

        try:
            # Get customer subscriptions from Stripe
            subscriptions = stripe.Subscription.list(
                customer=user.stripe_customer_id,
                status='all',
                limit=10
            )

            # Find the most recent active subscription
            active_subscription = None
            for subscription in subscriptions.data:
                if subscription.status in ['active', 'trialing']:
                    active_subscription = subscription
                    break

            if active_subscription:
                # Update user subscription info
                old_status = user.subscription_status
                user.stripe_subscription_id = active_subscription.id
                user.subscription_status = active_subscription.status
                user.subscription_expires_at = datetime.fromtimestamp(
                    active_subscription.current_period_end
                )

                # Get plan info if available
                if active_subscription.items.data:
                    price_id = active_subscription.items.data[0].price.id
                    plan = db.query(Plan).filter(
                        (Plan.stripe_monthly_price_id == price_id) |
                        (Plan.stripe_annual_price_id == price_id)
                    ).first()

                    if plan:
                        user.subscription_plan_id = plan.id

                db.commit()

                logger.info(f"Synced subscription for user {user.id}: {old_status} -> {active_subscription.status}")

                return {
                    "success": True,
                    "message": "Subscription synced successfully",
                    "subscription": {
                        "id": active_subscription.id,
                        "status": active_subscription.status,
                        "expires_at": user.subscription_expires_at.isoformat() if user.subscription_expires_at else None,
                        "plan_name": plan.name if plan else None
                    }
                }
            else:
                # No active subscription found
                user.subscription_status = "inactive"
                user.stripe_subscription_id = None
                user.subscription_expires_at = None
                user.subscription_plan_id = None
                db.commit()

                logger.info(f"No active subscription found for user {user.id}")

                return {
                    "success": True,
                    "message": "No active subscription found",
                    "subscription": None
                }

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error syncing subscription for user {user.id}: {e}")
            return {
                "success": False,
                "message": f"Stripe error: {str(e)}",
                "subscription": None
            }
        except Exception as e:
            logger.error(f"Error syncing subscription for user {user.id}: {e}")
            return {
                "success": False,
                "message": "Sync failed",
                "subscription": None
            }

    async def handle_expired_subscription(self, user: User, db: Session) -> Dict[str, Any]:
        """
        Handle expired subscription cleanup.
        
        Returns:
            Dict with cleanup status
        """
        try:
            # Clear subscription info
            user.subscription_status = "expired"
            user.stripe_subscription_id = None
            user.subscription_expires_at = None
            user.subscription_plan_id = None

            db.commit()

            logger.info(f"Cleaned up expired subscription for user {user.id}")

            return {
                "success": True,
                "message": "Expired subscription cleaned up"
            }

        except Exception as e:
            logger.error(f"Error handling expired subscription for user {user.id}: {e}")
            db.rollback()
            return {
                "success": False,
                "message": "Cleanup failed"
            }

    def get_subscription_status_message(self, user: User) -> str:
        """Get user-friendly subscription status message."""
        if not user.subscription_status:
            return "No subscription"

        status_messages = {
            "active": "Active subscription",
            "trialing": "Trial period",
            "past_due": "Payment past due",
            "canceled": "Subscription canceled",
            "incomplete": "Payment incomplete",
            "incomplete_expired": "Payment expired",
            "unpaid": "Payment failed",
            "expired": "Subscription expired",
            "inactive": "No active subscription"
        }

        message = status_messages.get(user.subscription_status, f"Status: {user.subscription_status}")

        if user.subscription_expires_at and user.subscription_status in ["active", "trialing"]:
            days_left = (user.subscription_expires_at - datetime.utcnow()).days
            if days_left > 0:
                message += f" (expires in {days_left} days)"
            else:
                message += " (expired)"

        return message