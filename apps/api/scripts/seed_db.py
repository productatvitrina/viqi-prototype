"""Seed database with mock Film & TV industry data - SQLite compatible."""
import os
import sys
import json
from loguru import logger

# Add the parent directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from config.database import SessionLocal
from models.models import Company, Person, Content, Plan, PricingGeo

# Configure logging
logger.add("logs/seed.log", rotation="500 MB", level="DEBUG" if os.getenv("DEBUG") else "INFO")


def mask_email(email: str) -> str:
    """Create a masked version of an email address."""
    if not email or '@' not in email:
        return "***@***.***"
    
    local, domain = email.split('@', 1)
    if '.' not in domain:
        return f"{local[0]}***@{domain[:2]}***.***"
    
    domain_name, tld = domain.rsplit('.', 1)
    
    # Mask local part
    if len(local) <= 2:
        masked_local = local[0] + '*'
    else:
        masked_local = local[0] + '*' * (len(local) - 2) + local[-1]
    
    # Mask domain
    if len(domain_name) <= 2:
        masked_domain = domain_name[0] + '*'
    else:
        masked_domain = domain_name[0] + '*' * (len(domain_name) - 2) + domain_name[-1]
    
    return f"{masked_local}@{masked_domain}.{tld}"


def seed_companies(db):
    """Seed companies data."""
    logger.info("Seeding companies...")
    
    companies_data = [
        {
            "name": "Netflix",
            "domain": "netflix.com", 
            "website": "https://netflix.com",
            "city": "Los Gatos",
            "country": "US",
            "description": "Global streaming entertainment service",
            "tags": json.dumps({"industry": "streaming", "type": "platform", "scale": "global"})
        },
        {
            "name": "Warner Bros. Pictures",
            "domain": "warnerbros.com",
            "website": "https://warnerbros.com", 
            "city": "Burbank",
            "country": "US",
            "description": "Major film and television studio",
            "tags": json.dumps({"industry": "studio", "type": "major", "scale": "global"})
        },
        {
            "name": "Paramount Pictures",
            "domain": "paramount.com",
            "website": "https://paramount.com",
            "city": "Hollywood",
            "country": "US", 
            "description": "American film and television production company",
            "tags": json.dumps({"industry": "studio", "type": "major", "scale": "global"})
        },
        {
            "name": "Industrial Light & Magic",
            "domain": "ilm.com",
            "website": "https://ilm.com",
            "city": "San Francisco",
            "country": "US",
            "description": "Visual effects and computer graphics company",
            "tags": json.dumps({"industry": "vfx", "type": "service", "specialty": "high-end"})
        },
        {
            "name": "Deluxe Entertainment",
            "domain": "deluxe.com", 
            "website": "https://deluxe.com",
            "city": "Los Angeles",
            "country": "US",
            "description": "Post-production and distribution services",
            "tags": json.dumps({"industry": "post", "type": "service", "services": ["color", "sound", "delivery"]})
        },
        {
            "name": "Pinewood Studios",
            "domain": "pinewoodgroup.com",
            "website": "https://pinewoodgroup.com", 
            "city": "London",
            "country": "GB",
            "description": "Film and television studio facilities",
            "tags": json.dumps({"industry": "facilities", "type": "studios", "scale": "international"})
        },
        {
            "name": "Amazon Studios",
            "domain": "amazon.com",
            "website": "https://studios.amazon.com",
            "city": "Los Angeles", 
            "country": "US",
            "description": "Film and television content production",
            "tags": json.dumps({"industry": "streaming", "type": "platform", "scale": "global"})
        },
        {
            "name": "FilmLight",
            "domain": "filmlight.ltd.uk",
            "website": "https://filmlight.ltd.uk",
            "city": "London",
            "country": "GB", 
            "description": "Color grading and workflow solutions",
            "tags": json.dumps({"industry": "post", "type": "technology", "specialty": "color"})
        }
    ]
    
    for company_data in companies_data:
        company = Company(**company_data)
        db.add(company)
        logger.debug(f"Added company: {company.name}")
    
    db.commit()
    logger.info(f"Seeded {len(companies_data)} companies")


def seed_people(db):
    """Seed people data."""
    logger.info("Seeding people...")
    
    # Get companies for foreign key relationships
    companies = {c.name: c.id for c in db.query(Company).all()}
    
    people_data = [
        # Netflix
        {
            "full_name": "Sarah Martinez",
            "title": "Director of Content Acquisition",
            "company_id": companies["Netflix"],
            "role_tags": "content acquisition,strategy,licensing",
            "territories": "US,LATAM",
            "email_plain": "sarah.martinez@netflix.com",
            "is_decision_maker": True
        },
        {
            "full_name": "David Chen",
            "title": "VP of Original Series",
            "company_id": companies["Netflix"],
            "role_tags": "development,production,series",
            "territories": "Global",
            "email_plain": "david.chen@netflix.com", 
            "is_decision_maker": True
        },
        
        # Warner Bros
        {
            "full_name": "Michael Thompson",
            "title": "Executive Producer",
            "company_id": companies["Warner Bros. Pictures"],
            "role_tags": "producer,development,features",
            "territories": "US,International",
            "email_plain": "m.thompson@warnerbros.com",
            "is_decision_maker": True
        },
        {
            "full_name": "Jessica Rodriguez",
            "title": "Head of Post-Production",
            "company_id": companies["Warner Bros. Pictures"],
            "role_tags": "post-production,workflow,delivery",
            "territories": "US",
            "email_plain": "j.rodriguez@warnerbros.com",
            "is_decision_maker": False
        },
        
        # Paramount
        {
            "full_name": "Robert Kim",
            "title": "Senior Vice President",
            "company_id": companies["Paramount Pictures"],
            "role_tags": "finance,greenlight,strategy",
            "territories": "Global",
            "email_plain": "robert.kim@paramount.com",
            "is_decision_maker": True
        },
        
        # ILM
        {
            "full_name": "Elena Volkova",
            "title": "VFX Supervisor",
            "company_id": companies["Industrial Light & Magic"],
            "role_tags": "vfx,supervision,creatures,environments",
            "territories": "US,Remote",
            "email_plain": "e.volkova@ilm.com",
            "is_decision_maker": False
        },
        {
            "full_name": "James Wright",
            "title": "Head of Business Development", 
            "company_id": companies["Industrial Light & Magic"],
            "role_tags": "business development,client relations,strategy",
            "territories": "Global",
            "email_plain": "james.wright@ilm.com",
            "is_decision_maker": True
        },
        
        # Deluxe
        {
            "full_name": "Maria Gonzalez",
            "title": "Director of Dubbing Services",
            "company_id": companies["Deluxe Entertainment"],
            "role_tags": "dubbing,localization,audio",
            "territories": "US,LATAM,EU",
            "email_plain": "maria.gonzalez@deluxe.com",
            "is_decision_maker": True
        },
        {
            "full_name": "Thomas Anderson",
            "title": "Senior Colorist",
            "company_id": companies["Deluxe Entertainment"],
            "role_tags": "color,grading,finishing",
            "territories": "US,Remote",
            "email_plain": "t.anderson@deluxe.com", 
            "is_decision_maker": False
        },
        
        # Pinewood
        {
            "full_name": "Oliver Bennett",
            "title": "Head of Studio Operations",
            "company_id": companies["Pinewood Studios"],
            "role_tags": "facilities,production services,stages",
            "territories": "UK,EU",
            "email_plain": "o.bennett@pinewoodgroup.com",
            "is_decision_maker": True
        },
        
        # Amazon Studios
        {
            "full_name": "Priya Sharma",
            "title": "Head of International Originals",
            "company_id": companies["Amazon Studios"],
            "role_tags": "development,international,content",
            "territories": "Global",
            "email_plain": "priya.sharma@amazon.com",
            "is_decision_maker": True
        },
        
        # FilmLight
        {
            "full_name": "Andrew Taylor",
            "title": "Technical Sales Director",
            "company_id": companies["FilmLight"],
            "role_tags": "sales,technology,workflow",
            "territories": "EMEA,APAC",
            "email_plain": "a.taylor@filmlight.ltd.uk",
            "is_decision_maker": True
        }
    ]
    
    for person_data in people_data:
        # Create masked email
        person_data["email_masked"] = mask_email(person_data["email_plain"])
        
        person = Person(**person_data)
        db.add(person)
        logger.debug(f"Added person: {person.full_name} at {person_data.get('email_plain')}")
    
    db.commit()
    logger.info(f"Seeded {len(people_data)} people")


def seed_content(db):
    """Seed content data.""" 
    logger.info("Seeding content...")
    
    content_data = [
        {
            "title": "The Crown",
            "type": "tv",
            "year": 2016,
            "genres": "Drama,Biography,History",
            "status": "released",
            "budget_band": "high",
            "territories": "Global",
            "tags": json.dumps({"platform": "netflix", "seasons": 6, "awards": "emmy"})
        },
        {
            "title": "Dune",
            "type": "movie", 
            "year": 2021,
            "genres": "Sci-Fi,Adventure,Drama",
            "status": "released",
            "budget_band": "ultra",
            "territories": "Global",
            "tags": json.dumps({"studio": "warner", "franchise": True, "vfx_heavy": True})
        },
        {
            "title": "Top Gun: Maverick",
            "type": "movie",
            "year": 2022,
            "genres": "Action,Drama",
            "status": "released", 
            "budget_band": "high",
            "territories": "Global",
            "tags": json.dumps({"studio": "paramount", "sequel": True, "practical_effects": True})
        },
        {
            "title": "The Boys",
            "type": "tv",
            "year": 2019,
            "genres": "Action,Comedy,Crime",
            "status": "production",
            "budget_band": "medium",
            "territories": "Global",
            "tags": json.dumps({"platform": "prime", "superhero": True, "mature": True})
        },
        {
            "title": "Avatar: The Way of Water",
            "type": "movie",
            "year": 2022,
            "genres": "Sci-Fi,Action,Adventure",
            "status": "released",
            "budget_band": "ultra",
            "territories": "Global", 
            "tags": json.dumps({"director": "cameron", "vfx_heavy": True, "franchise": True})
        },
        {
            "title": "House of the Dragon",
            "type": "tv",
            "year": 2022,
            "genres": "Fantasy,Drama,Action",
            "status": "production",
            "budget_band": "ultra",
            "territories": "Global",
            "tags": json.dumps({"network": "hbo", "franchise": "got", "fantasy": True})
        },
        {
            "title": "Everything Everywhere All at Once",
            "type": "movie",
            "year": 2022,
            "genres": "Sci-Fi,Comedy,Action",
            "status": "released",
            "budget_band": "low", 
            "territories": "Global",
            "tags": json.dumps({"independent": True, "multiverse": True, "awards": "oscar"})
        },
        {
            "title": "Wednesday",
            "type": "tv",
            "year": 2022,
            "genres": "Comedy,Family,Horror",
            "status": "production",
            "budget_band": "medium",
            "territories": "Global",
            "tags": json.dumps({"platform": "netflix", "family": "addams", "teen": True})
        }
    ]
    
    for content_item in content_data:
        content = Content(**content_item)
        db.add(content)
        logger.debug(f"Added content: {content.title} ({content.type})")
    
    db.commit()
    logger.info(f"Seeded {len(content_data)} content items")


def seed_pricing(db):
    """Seed pricing and geo data."""
    logger.info("Seeding pricing data...")
    
    # Pricing geo groups
    geo_data = [
        {
            "geo_group": "tier1",
            "countries": "US,CA,GB,AU,DE,FR,NL,SE,DK,NO",
            "currency": "USD"
        },
        {
            "geo_group": "tier2", 
            "countries": "ES,IT,PT,JP,KR,SG,HK",
            "currency": "USD"
        },
        {
            "geo_group": "tier3",
            "countries": "BR,MX,AR,IN,ID,TH,PH",
            "currency": "USD"
        },
        {
            "geo_group": "default",
            "countries": "*",
            "currency": "USD"
        }
    ]
    
    for geo_item in geo_data:
        geo = PricingGeo(**geo_item)
        db.add(geo)
        logger.debug(f"Added geo pricing: {geo.geo_group}")
    
    # Subscription plans
    plans_data = [
        {
            "name": "Starter",
            "monthly_price_cents": 2900,  # $29
            "annual_price_cents": 29000,  # $290 (2 months free)
            "included_credits": 50,
            "overage_price_cents": 100,   # $1 per credit
            "currency": "USD",
            "geo_group": "tier1"
        },
        {
            "name": "Pro", 
            "monthly_price_cents": 7900,  # $79
            "annual_price_cents": 79000,  # $790 (2 months free)
            "included_credits": 200,
            "overage_price_cents": 80,    # $0.80 per credit
            "currency": "USD",
            "geo_group": "tier1"
        },
        # Tier 2 pricing (20% less)
        {
            "name": "Starter",
            "monthly_price_cents": 2320,  # ~$23
            "annual_price_cents": 23200,
            "included_credits": 50,
            "overage_price_cents": 80,
            "currency": "USD", 
            "geo_group": "tier2"
        },
        {
            "name": "Pro",
            "monthly_price_cents": 6320,  # ~$63
            "annual_price_cents": 63200,
            "included_credits": 200,
            "overage_price_cents": 64,
            "currency": "USD",
            "geo_group": "tier2"
        },
        # Default pricing (same as tier1)
        {
            "name": "Starter",
            "monthly_price_cents": 2900,
            "annual_price_cents": 29000,
            "included_credits": 50,
            "overage_price_cents": 100,
            "currency": "USD",
            "geo_group": "default"
        },
        {
            "name": "Pro",
            "monthly_price_cents": 7900,
            "annual_price_cents": 79000,
            "included_credits": 200,
            "overage_price_cents": 80,
            "currency": "USD",
            "geo_group": "default"
        }
    ]
    
    for plan_data in plans_data:
        plan = Plan(**plan_data)
        db.add(plan)
        logger.debug(f"Added plan: {plan.name} ({plan.geo_group})")
    
    db.commit()
    logger.info(f"Seeded {len(geo_data)} geo groups and {len(plans_data)} plans")


def main():
    """Main seeding function."""
    db = SessionLocal()
    
    try:
        logger.info("Starting database seeding...")
        
        # Check if data already exists
        existing_companies = db.query(Company).count()
        if existing_companies > 0:
            logger.warning(f"Database already contains {existing_companies} companies. Skipping seed.")
            return
        
        # Seed all data
        seed_companies(db)
        seed_people(db)
        seed_content(db)
        seed_pricing(db)
        
        logger.info("Database seeding completed successfully!")
        
    except Exception as e:
        logger.error(f"Database seeding failed: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()