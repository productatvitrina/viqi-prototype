"""LLM service for Gemini and OpenAI integration."""
import os
import json
import asyncio
import aiohttp
from typing import Dict, List, Any, Tuple
from loguru import logger
import google.generativeai as genai


class LLMService:
    """Service for interacting with LLM providers."""

    def __init__(self):
        """Initialize LLM service with configuration."""
        self.config = self._load_config()
        self._setup_clients()

    def _load_config(self) -> Dict[str, Any]:
        """Load LLM configuration from file."""
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'llm.config.json')
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
            logger.debug(f"Loaded LLM config: active={config['active']}")
            return config
        except Exception as e:
            logger.error(f"Failed to load LLM config: {e}")
            # Return default config
            return {
                "active": "gemini",
                "models": {
                    "gemini": {"model": "gemini-1.5-flash", "temperature": 0.7}
                }
            }

    def _setup_clients(self):
        """Set up LLM provider clients."""
        try:
            # Configure Gemini
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key:
                genai.configure(api_key=gemini_key)
                self.gemini_model = genai.GenerativeModel('gemini-1.5-flash')
                logger.debug("Gemini client configured successfully")
            else:
                logger.warning("GEMINI_API_KEY not found")

        except Exception as e:
            logger.error(f"Failed to setup LLM clients: {e}")

    async def generate_matches(
        self,
        query: str,
        user_context: Dict[str, Any],
        candidates: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
        """
        Generate match recommendations using LLM.

        Args:
            query: User's natural language query
            user_context: User and company context
            candidates: List of potential matches

        Returns:
            Tuple of (recommendations, token_usage)
        """
        logger.debug(f"Generating matches for query: {query[:100]}...")

        try:
            # Build prompt
            prompt = self._build_matching_prompt(query, user_context, candidates)
            logger.debug(f"Built prompt with {len(candidates)} candidates")

            # Call active LLM provider
            active_provider = self.config["active"]
            
            if active_provider == "gemini":
                recommendations, tokens = await self._call_gemini(prompt)
            else:
                raise ValueError(f"Unsupported provider: {active_provider}")

            # Validate and filter recommendations
            validated_recommendations = self._validate_recommendations(recommendations, candidates)
            
            logger.info(f"Generated {len(validated_recommendations)} validated recommendations")
            return validated_recommendations, tokens

        except Exception as e:
            logger.error(f"❌ Failed to generate matches: {str(e)}")
            logger.error(f"Exception type: {type(e).__name__}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            # Return fallback recommendations
            logger.warning("🔄 Using fallback matches due to LLM failure")
            fallback = self._generate_fallback_matches(candidates[:4])
            return fallback, {"prompt": 0, "completion": 0, "total": 0}

    async def assess_credit_cost(self, query: str) -> int:
        """
        Assess the credit cost for a query using LLM.

        Args:
            query: User's query

        Returns:
            Credit cost (1-5)
        """
        logger.debug(f"Assessing credit cost for query: {query[:50]}...")

        try:
            credit_prompt = self.config["prompts"]["credit_assessment"]
            prompt = credit_prompt["template"].format(query=query)

            if self.config["active"] == "gemini":
                response = await self.gemini_model.generate_content_async(
                    f"{credit_prompt['system']}\n\n{prompt}"
                )
                cost_str = response.text.strip()
                
                # Extract number from response
                for char in cost_str:
                    if char.isdigit() and 1 <= int(char) <= 5:
                        cost = int(char)
                        logger.debug(f"Assessed credit cost: {cost}")
                        return cost

            # Default to 1 credit if assessment fails
            logger.warning("Credit assessment failed, defaulting to 1 credit")
            return 1

        except Exception as e:
            logger.error(f"Failed to assess credit cost: {e}")
            return 1

    def _build_matching_prompt(
        self,
        query: str,
        user_context: Dict[str, Any],
        candidates: List[Dict[str, Any]]
    ) -> str:
        """Build the matching prompt with context."""
        
        # Format user context
        context_str = f"User: {user_context.get('email', 'Anonymous')}"
        if user_context.get("company"):
            company = user_context["company"]
            context_str += f"\nCompany: {company['name']} ({company.get('domain', 'N/A')})"
            if company.get("description"):
                context_str += f"\nCompany Description: {company['description']}"
            if company.get("tags"):
                context_str += f"\nCompany Type: {company['tags']}"
        else:
            context_str += "\nCompany: Independent/Freelancer"

        # Format candidates
        candidates_str = ""
        for i, candidate in enumerate(candidates[:20]):  # Limit to prevent token overflow
            candidates_str += f"{i+1}. ID: {candidate['id']}, Name: {candidate['full_name']}, "
            candidates_str += f"Title: {candidate['title']}, Company: {candidate['company_name']}, "
            candidates_str += f"Tags: {', '.join(candidate.get('role_tags', []))}\n"

        prompt_template = self.config["prompts"]["matching"]["template"]
        
        return prompt_template.format(
            query=query,
            user_context=context_str,
            candidates=candidates_str
        )

    async def _call_gemini(self, prompt: str) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
        """Call Gemini API."""
        try:
            if not hasattr(self, 'gemini_model') or self.gemini_model is None:
                logger.error("Gemini model not initialized!")
                return [], {"prompt": 0, "completion": 0, "total": 0}
            
            system_prompt = self.config["prompts"]["matching"]["system"]
            full_prompt = f"{system_prompt}\n\n{prompt}"
            
            logger.info(f"🤖 Calling Gemini API with {len(full_prompt)} characters...")
            logger.debug(f"Prompt preview: {full_prompt[:200]}...")
            
            response = await self.gemini_model.generate_content_async(full_prompt)
            logger.info("✅ Gemini API responded successfully")
            
            # Parse JSON response
            response_text = response.text.strip()
            logger.debug(f"Gemini response: {response_text[:200]}...")
            
            # Try to extract JSON from the response
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            
            try:
                parsed_response = json.loads(response_text)
                recommendations = parsed_response.get("recommendations", [])
            except json.JSONDecodeError:
                logger.warning("Failed to parse JSON response, using fallback")
                recommendations = []

            # Estimate tokens (Gemini doesn't provide exact counts)
            tokens = {
                "prompt": len(full_prompt.split()) * 1.3,  # Rough estimation
                "completion": len(response_text.split()) * 1.3,
                "total": 0
            }
            tokens["total"] = int(tokens["prompt"] + tokens["completion"])

            return recommendations, tokens

        except Exception as e:
            logger.error(f"❌ Gemini API call failed: {str(e)}")
            logger.error(f"Exception type: {type(e).__name__}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return [], {"prompt": 0, "completion": 0, "total": 0}

    def _validate_recommendations(
        self,
        recommendations: List[Dict[str, Any]],
        candidates: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Validate and filter recommendations."""
        validated = []
        candidate_ids = {c["id"] for c in candidates}
        
        for rec in recommendations:
            try:
                person_id = rec.get("person_id")
                if person_id in candidate_ids:
                    # Find the candidate to get company_id
                    candidate = next(c for c in candidates if c["id"] == person_id)
                    
                    validated_rec = {
                        "person_id": person_id,
                        "company_id": candidate.get("company_id"),
                        "reason": rec.get("reason", "Good potential match")[:500],
                        "email_draft": rec.get("email_draft", "")[:1000],
                        "score": min(max(float(rec.get("score", 0.8)), 0.0), 1.0),
                        "email_address": rec.get("email_address", f"{candidate.get('full_name', 'contact').lower().replace(' ', '.')}@{candidate.get('company_name', 'company').lower().replace(' ', '')}.com")
                    }
                    validated.append(validated_rec)
                    
                    if len(validated) >= 4:  # Limit to 4 recommendations
                        break
                        
            except (ValueError, TypeError, KeyError) as e:
                logger.warning(f"Invalid recommendation skipped: {e}")
                continue

        # If we don't have enough validated recommendations, add fallbacks
        while len(validated) < 4 and len(validated) < len(candidates):
            remaining_candidates = [c for c in candidates if c["id"] not in [r["person_id"] for r in validated]]
            if not remaining_candidates:
                break
                
            candidate = remaining_candidates[0]
            fallback_rec = {
                "person_id": candidate["id"],
                "company_id": candidate.get("company_id"),
                "reason": f"Experienced professional at {candidate.get('company_name', 'a leading company')} with relevant industry expertise and strong track record in film and TV projects.",
                "email_draft": f"Hi {candidate['full_name']},\n\nI came across your profile at {candidate.get('company_name', 'your company')} and was impressed by your experience in the film and TV industry. I'm currently working on a project that could benefit from your expertise.\n\nWould you be open to a brief conversation to discuss potential collaboration opportunities? I'd be happy to share more details about the project and how it might align with your interests.\n\nBest regards",
                "score": 0.6,
                "email_address": f"{candidate.get('full_name', 'contact').lower().replace(' ', '.')}@{candidate.get('company_name', 'company').lower().replace(' ', '')}.com"
            }
            validated.append(fallback_rec)

        logger.debug(f"Validated {len(validated)} recommendations")
        return validated

    def _generate_fallback_matches(self, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Generate fallback matches when LLM fails."""
        logger.warning("Using fallback match generation")
        
        fallback_matches = []
        for candidate in candidates[:4]:
            match = {
                "person_id": candidate["id"],
                "company_id": candidate.get("company_id"),
                "reason": f"Industry professional at {candidate.get('company_name', 'leading company')}",
                "email_draft": f"Hi {candidate['full_name']},\n\nI'm reaching out because I believe there might be synergy between what you do at {candidate.get('company_name', 'your company')} and my current project. Would you be open to a brief conversation?\n\nBest regards",
                "score": 0.5
            }
            fallback_matches.append(match)
            
        return fallback_matches
