"""Database models for ViQi application - SQLite compatible."""
import os
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, 
    ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from config.database import Base
from loguru import logger


class User(Base):
    """User model for authentication and user management."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=True)
    auth_provider = Column(String(50), default="google")
    role = Column(String(20), default="user")  # user, admin
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    country = Column(String(10), nullable=True)
    credits_balance = Column(Integer, default=0)
    
    # Stripe subscription fields
    stripe_customer_id = Column(String(255), nullable=True, index=True)
    stripe_subscription_id = Column(String(255), nullable=True, index=True)
    subscription_status = Column(String(50), nullable=True)  # active, past_due, canceled, incomplete, incomplete_expired, trialing, unpaid
    subscription_plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True)
    subscription_expires_at = Column(DateTime(timezone=True), nullable=True)
    subscription_created_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    company = relationship("Company", back_populates="users")
    matches = relationship("Match", back_populates="user")
    payments = relationship("Payment", back_populates="user")
    usage_logs = relationship("UsageLog", back_populates="user")
    subscription_plan = relationship("Plan", foreign_keys=[subscription_plan_id])

    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"
    
    def is_subscribed(self) -> bool:
        """Check if user has an active subscription."""
        return (
            self.subscription_status in ['active', 'trialing'] and
            self.subscription_expires_at and
            self.subscription_expires_at > datetime.utcnow()
        )
    
    def has_credits_or_subscription(self) -> bool:
        """Check if user has credits or active subscription."""
        return self.credits_balance > 0 or self.is_subscribed()
    
    def can_access_premium_features(self) -> bool:
        """Check if user can access premium features."""
        return self.is_subscribed() or self.credits_balance > 0


class Company(Base):
    """Company model for film & TV industry companies."""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    domain = Column(String(255), nullable=True, index=True)
    website = Column(String(500), nullable=True)
    city = Column(String(100), nullable=True)
    country = Column(String(10), nullable=True)
    description = Column(Text, nullable=True)
    tags = Column(Text, nullable=True)  # JSON serialized as text for SQLite
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    users = relationship("User", back_populates="company")
    people = relationship("Person", back_populates="company")

    def __repr__(self):
        return f"<Company(id={self.id}, name='{self.name}')>"


class Person(Base):
    """Person model for individuals in the film & TV industry."""
    __tablename__ = "people"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    role_tags = Column(Text, nullable=True)  # Comma-separated for SQLite
    territories = Column(Text, nullable=True)  # Comma-separated for SQLite
    email_plain = Column(String(255), nullable=True)  # Encrypted in production
    email_masked = Column(String(255), nullable=True)  # Pre-computed masked version
    is_decision_maker = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    company = relationship("Company", back_populates="people")
    match_results = relationship("MatchResult", back_populates="person")

    def __repr__(self):
        return f"<Person(id={self.id}, name='{self.full_name}', company='{self.company.name if self.company else None}')>"


class Content(Base):
    """Content model for movies and TV shows."""
    __tablename__ = "content"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    type = Column(String(20), nullable=False)  # movie, tv
    year = Column(Integer, nullable=True)
    genres = Column(Text, nullable=True)  # Comma-separated for SQLite
    status = Column(String(50), nullable=True)  # development, production, post, released
    budget_band = Column(String(50), nullable=True)  # low, medium, high, ultra
    territories = Column(Text, nullable=True)  # Comma-separated for SQLite
    tags = Column(Text, nullable=True)  # JSON serialized as text for SQLite
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Content(id={self.id}, title='{self.title}', type='{self.type}')>"


class Plan(Base):
    """Subscription plans for pricing."""
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    monthly_price_cents = Column(Integer, nullable=False)
    annual_price_cents = Column(Integer, nullable=False)
    included_credits = Column(Integer, nullable=False)
    overage_price_cents = Column(Integer, nullable=False)
    currency = Column(String(3), default="USD")
    geo_group = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=True)
    stripe_monthly_price_id = Column(String(255), nullable=True)
    stripe_annual_price_id = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    payments = relationship("Payment", back_populates="plan")

    def __repr__(self):
        return f"<Plan(id={self.id}, name='{self.name}', geo='{self.geo_group}')>"


class PricingGeo(Base):
    """Geographic pricing configuration."""
    __tablename__ = "pricing_geo"

    id = Column(Integer, primary_key=True, index=True)
    geo_group = Column(String(50), nullable=False, index=True)
    countries = Column(Text, nullable=False)  # Comma-separated for SQLite
    currency = Column(String(3), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<PricingGeo(geo='{self.geo_group}', currency='{self.currency}')>"


class Match(Base):
    """Match requests made by users."""
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    query_text = Column(Text, nullable=False)
    normalized_intent = Column(String(255), nullable=True)
    llm_model = Column(String(100), nullable=False)
    token_prompt = Column(Integer, default=0)
    token_completion = Column(Integer, default=0)
    token_total = Column(Integer, default=0)
    credit_cost = Column(Integer, default=1)
    price_offered_cents = Column(Integer, nullable=True)
    currency = Column(String(3), default="USD")
    status = Column(String(20), default="preview")  # preview, paid, revealed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="matches")
    match_results = relationship("MatchResult", back_populates="match", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Match(id={self.id}, user_id={self.user_id}, status='{self.status}')>"


class MatchResult(Base):
    """Individual match results for a match request."""
    __tablename__ = "match_results"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    score = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)
    email_draft = Column(Text, nullable=True)
    email_masked = Column(String(255), nullable=True)
    email_plain = Column(String(255), nullable=True)  # Encrypted in production
    revealed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    match = relationship("Match", back_populates="match_results")
    person = relationship("Person", back_populates="match_results")

    def __repr__(self):
        return f"<MatchResult(id={self.id}, match_id={self.match_id}, person_id={self.person_id})>"


class Payment(Base):
    """Payment records for subscriptions and credits."""
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_checkout_id = Column(String(255), nullable=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False)
    status = Column(String(50), nullable=False)  # pending, succeeded, failed
    credits_purchased = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="payments")
    plan = relationship("Plan", back_populates="payments")

    def __repr__(self):
        return f"<Payment(id={self.id}, user_id={self.user_id}, amount={self.amount_cents}, status='{self.status}')>"


class UsageLog(Base):
    """Usage tracking for analytics and billing."""
    __tablename__ = "usage_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    kind = Column(String(50), nullable=False)  # api_call, contact_reveal, email_reveal, query
    amount = Column(Integer, default=1)
    tokens_prompt = Column(Integer, default=0)
    tokens_completion = Column(Integer, default=0)
    llm_model = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="usage_logs")

    def __repr__(self):
        return f"<UsageLog(id={self.id}, user_id={self.user_id}, kind='{self.kind}')>"


# Create indexes for better performance
def create_indexes():
    """Create database indexes for better query performance."""
    logger.info("Creating database indexes...")
    
    # Most indexes are created via Column(index=True) above
    # SQLite will handle the basic indexing
    
    logger.info("Database indexes created successfully")