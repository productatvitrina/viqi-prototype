"""Background tasks for subscription management."""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from loguru import logger

from config.database import get_db
from models.models import User
from services.subscription_service import SubscriptionService


async def cleanup_expired_subscriptions():
    """Check for and cleanup expired subscriptions."""
    logger.info("Starting subscription cleanup task")
    
    try:
        # Get database session
        db = next(get_db())
        subscription_service = SubscriptionService()
        
        # Find users with subscriptions that might be expired
        users_to_check = db.query(User).filter(
            User.subscription_status.in_(['active', 'trialing', 'past_due']),
            User.subscription_expires_at.isnot(None)
        ).all()
        
        logger.info(f"Found {len(users_to_check)} users with subscriptions to check")
        
        expired_count = 0
        updated_count = 0
        
        for user in users_to_check:
            try:
                # Check if subscription is expired
                expiry_check = await subscription_service.check_subscription_expiry(user, db)
                
                if expiry_check["status"] == "expired":
                    # Handle expired subscription
                    cleanup_result = await subscription_service.handle_expired_subscription(user, db)
                    if cleanup_result["success"]:
                        expired_count += 1
                        logger.info(f"Cleaned up expired subscription for user {user.id}")
                
                elif expiry_check["action_needed"]:
                    # Sync with Stripe to get latest status
                    sync_result = await subscription_service.sync_subscription_from_stripe(user, db)
                    if sync_result["success"]:
                        updated_count += 1
                        logger.info(f"Synced subscription for user {user.id}")
                        
            except Exception as e:
                logger.error(f"Error processing user {user.id}: {e}")
                continue
        
        logger.info(f"Subscription cleanup completed: {expired_count} expired, {updated_count} updated")
        
        return {
            "success": True,
            "users_checked": len(users_to_check),
            "expired_cleaned": expired_count,
            "updated": updated_count
        }
        
    except Exception as e:
        logger.error(f"Subscription cleanup task failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }
    finally:
        if 'db' in locals():
            db.close()


async def check_subscription_renewals():
    """Check for subscriptions that need renewal reminders."""
    logger.info("Checking for subscription renewals")
    
    try:
        db = next(get_db())
        subscription_service = SubscriptionService()
        
        # Find users with subscriptions expiring in the next 7 days
        cutoff_date = datetime.utcnow() + timedelta(days=7)
        
        users_expiring_soon = db.query(User).filter(
            User.subscription_status.in_(['active', 'trialing']),
            User.subscription_expires_at.isnot(None),
            User.subscription_expires_at <= cutoff_date,
            User.subscription_expires_at > datetime.utcnow()
        ).all()
        
        logger.info(f"Found {len(users_expiring_soon)} users with subscriptions expiring soon")
        
        # For now, just log the users - in production you'd send emails
        for user in users_expiring_soon:
            expiry_check = await subscription_service.check_subscription_expiry(user, db)
            logger.info(f"User {user.id} ({user.email}) subscription expires in {expiry_check['expires_in_days']} days")
        
        return {
            "success": True,
            "users_expiring_soon": len(users_expiring_soon)
        }
        
    except Exception as e:
        logger.error(f"Renewal check task failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }
    finally:
        if 'db' in locals():
            db.close()


async def run_subscription_tasks():
    """Run all subscription-related background tasks."""
    logger.info("Running subscription background tasks")
    
    try:
        # Run cleanup task
        cleanup_result = await cleanup_expired_subscriptions()
        
        # Run renewal check
        renewal_result = await check_subscription_renewals()
        
        logger.info("All subscription tasks completed")
        
        return {
            "cleanup": cleanup_result,
            "renewals": renewal_result
        }
        
    except Exception as e:
        logger.error(f"Background tasks failed: {e}")
        return {
            "error": str(e)
        }


# Simple scheduler function (in production use Celery or similar)
async def schedule_subscription_tasks():
    """Schedule subscription tasks to run periodically."""
    logger.info("Starting subscription task scheduler")
    
    while True:
        try:
            # Run tasks every 6 hours
            await run_subscription_tasks()
            await asyncio.sleep(6 * 60 * 60)  # 6 hours
        except Exception as e:
            logger.error(f"Scheduler error: {e}")
            await asyncio.sleep(60)  # Wait 1 minute before retrying