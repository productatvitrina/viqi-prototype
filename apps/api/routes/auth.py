"""Authentication routes and utilities."""
import os
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from loguru import logger

from config.database import get_db
from models.models import User, Company, Plan

router = APIRouter()
security = HTTPBearer()

# JWT settings
SECRET_KEY = os.getenv("BACKEND_JWT_SECRET", "viqi-backend-jwt-secret-for-development")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours instead of 30 minutes


class TokenData(BaseModel):
    """Token data model."""
    email: str
    user_id: int
    name: Optional[str] = None


class UserCreate(BaseModel):
    """User creation model."""
    email: EmailStr
    name: Optional[str] = None
    auth_provider: str = "google"
    business_domain: Optional[str] = None


class UserResponse(BaseModel):
    """User response model."""
    id: int
    email: str
    name: Optional[str]
    role: str
    credits_balance: int
    company: Optional[Dict[str, Any]] = None
    subscription_status: Optional[str] = None
    is_subscribed: bool = False
    can_access_premium: bool = False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    logger.debug(f"Created access token for user: {data.get('email')}")
    return encoded_jwt


def get_domain_from_email(email: str) -> Optional[str]:
    """Extract domain from email address."""
    if '@' in email:
        domain = email.split('@')[1].lower()
        # Skip common free email providers
        free_providers = [
            'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
            'icloud.com', 'protonmail.com', 'aol.com'
        ]
        if domain not in free_providers:
            return domain
    return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("email")
        user_id: int = payload.get("user_id")
        
        if email is None or user_id is None:
            logger.warning("Invalid token payload")
            raise credentials_exception
            
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.PyJWTError as e:
        logger.warning(f"JWT decode error: {e}")
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id, User.email == email).first()
    if user is None:
        logger.warning(f"User not found: {email}")
        raise credentials_exception
    
    logger.debug(f"Authenticated user: {user.email}")
    return user


@router.post("/verify-token")
async def verify_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify JWT token and return user info."""
    logger.info(f"Token verification for user: {current_user.email}")
    
    # Get company info if available
    company_info = None
    if current_user.company:
        company_info = {
            "id": current_user.company.id,
            "name": current_user.company.name,
            "domain": current_user.company.domain,
            "description": current_user.company.description
        }
    
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        credits_balance=current_user.credits_balance,
        company=company_info,
        subscription_status=current_user.subscription_status,
        is_subscribed=current_user.is_subscribed(),
        can_access_premium=current_user.can_access_premium_features()
    )


@router.post("/register")
async def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    """Register a new user from SSO."""
    logger.info(f"Registering user: {user_data.email}")
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        logger.info(f"User already exists: {user_data.email}")
        # Return existing user with fresh token
        return await _create_user_response(existing_user, db)
    
    # Try to find company by business domain (preferred) or email domain
    company = None
    domain_to_search = user_data.business_domain or get_domain_from_email(user_data.email)
    
    if domain_to_search:
        company = db.query(Company).filter(Company.domain == domain_to_search).first()
        if company:
            logger.info(f"Found company for domain {domain_to_search}: {company.name}")
        elif user_data.business_domain:
            # Create a new company entry for the business domain
            logger.info(f"Creating new company entry for business domain: {domain_to_search}")
            company = Company(
                name=domain_to_search.replace('.com', '').replace('.', ' ').title(),
                domain=domain_to_search,
                description=f"Company associated with {domain_to_search}",
                tags="business"
            )
            db.add(company)
            db.commit()
            db.refresh(company)
    
    # Create new user
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        auth_provider=user_data.auth_provider,
        company_id=company.id if company else None,
        credits_balance=1  # Give 1 free credit for preview
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    logger.info(f"Created new user: {new_user.email} (ID: {new_user.id})")
    
    return await _create_user_response(new_user, db)


async def _create_user_response(user: User, db: Session) -> Dict[str, Any]:
    """Create user response with token."""
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"email": user.email, "user_id": user.id, "name": user.name},
        expires_delta=access_token_expires
    )
    
    # Get company info if available
    company_info = None
    if user.company:
        company_info = {
            "id": user.company.id,
            "name": user.company.name,
            "domain": user.company.domain,
            "description": user.company.description
        }
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "credits_balance": user.credits_balance,
            "company": company_info,
            "subscription_status": user.subscription_status,
            "is_subscribed": user.is_subscribed(),
            "can_access_premium": user.can_access_premium_features()
        }
    }


@router.post("/refresh")
async def refresh_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Refresh JWT token for authenticated user."""
    logger.info(f"Refreshing token for user: {current_user.email}")
    
    # Generate a new token with full expiry time
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"email": current_user.email, "user_id": current_user.id, "name": current_user.name},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current user information."""
    company_info = None
    if current_user.company:
        company_info = {
            "id": current_user.company.id,
            "name": current_user.company.name,
            "domain": current_user.company.domain,
            "description": current_user.company.description
        }
    
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        credits_balance=current_user.credits_balance,
        company=company_info,
        subscription_status=current_user.subscription_status,
        is_subscribed=current_user.is_subscribed(),
        can_access_premium=current_user.can_access_premium_features()
    )


@router.post("/sync-subscription")
async def sync_subscription_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sync user subscription status from Stripe."""
    import stripe
    
    logger.info(f"Syncing subscription status for user {current_user.id}")
    
    try:
        # If user has a Stripe customer ID, check their subscriptions
        if current_user.stripe_customer_id:
            stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
            
            # Get customer subscriptions from Stripe
            subscriptions = stripe.Subscription.list(
                customer=current_user.stripe_customer_id,
                status='all'
            )
            
            # Find active subscription
            active_subscription = None
            for subscription in subscriptions.data:
                if subscription.status in ['active', 'trialing']:
                    active_subscription = subscription
                    break
            
            if active_subscription:
                # Update user subscription info
                current_user.stripe_subscription_id = active_subscription.id
                current_user.subscription_status = active_subscription.status
                current_user.subscription_expires_at = datetime.fromtimestamp(
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
                        current_user.subscription_plan_id = plan.id
                
                db.commit()
                logger.info(f"Updated subscription status to {active_subscription.status}")
                
                return {
                    "status": "synced",
                    "subscription_status": current_user.subscription_status,
                    "is_subscribed": current_user.is_subscribed(),
                    "expires_at": current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None
                }
            else:
                # No active subscription found
                current_user.subscription_status = "inactive"
                current_user.stripe_subscription_id = None
                current_user.subscription_expires_at = None
                current_user.subscription_plan_id = None
                db.commit()
                
                logger.info("No active subscription found")
                return {
                    "status": "synced", 
                    "subscription_status": "inactive",
                    "is_subscribed": False
                }
        else:
            logger.info("User has no Stripe customer ID")
            return {
                "status": "no_customer",
                "subscription_status": None,
                "is_subscribed": False
            }
            
    except Exception as e:
        logger.error(f"Failed to sync subscription status: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to sync subscription status"
        )


@router.get("/subscription-status")
async def check_subscription_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check user's subscription status and expiry."""
    from services.subscription_service import SubscriptionService
    
    subscription_service = SubscriptionService()
    
    try:
        # Check expiry status
        expiry_check = await subscription_service.check_subscription_expiry(current_user, db)
        
        # Get subscription message
        status_message = subscription_service.get_subscription_status_message(current_user)
        
        return {
            "user_id": current_user.id,
            "subscription_status": current_user.subscription_status,
            "status_message": status_message,
            "is_subscribed": current_user.is_subscribed(),
            "can_access_premium": current_user.can_access_premium_features(),
            "credits_balance": current_user.credits_balance,
            "expiry_check": expiry_check,
            "expires_at": current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None
        }
        
    except Exception as e:
        logger.error(f"Failed to check subscription status for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to check subscription status"
        )


@router.post("/cleanup-subscriptions")
async def cleanup_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually trigger subscription cleanup (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    
    try:
        from tasks.subscription_cleanup import run_subscription_tasks
        
        logger.info(f"Manual subscription cleanup triggered by admin {current_user.id}")
        
        # Run the cleanup tasks
        result = await run_subscription_tasks()
        
        return {
            "success": True,
            "message": "Subscription cleanup completed",
            "results": result
        }
        
    except Exception as e:
        logger.error(f"Manual subscription cleanup failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Subscription cleanup failed"
        )
