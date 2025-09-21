"""LLM provider abstraction supporting OpenAI and Gemini backends."""
from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Dict, List, Optional

from loguru import logger

try:  # Optional dependency; only required when OpenAI is used
    from openai import AsyncOpenAI  # type: ignore
except Exception:  # pragma: no cover - openai not installed
    AsyncOpenAI = None

try:  # Optional dependency; only required when Gemini is used
    import google.generativeai as genai
except Exception:  # pragma: no cover - gemini not installed
    genai = None


class LLMProviderError(Exception):
    """Raised when an LLM provider cannot fulfil a request."""


class LLMProvider:
    """Wrapper around the configured LLM provider."""

    def __init__(self) -> None:
        desired = (os.getenv("LLM_PROVIDER") or "").strip().lower() or None

        self.provider_name: str = "mock"
        self.openai_client: Optional[AsyncOpenAI] = None
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.gemini_model = None

        openai_key = os.getenv("OPENAI_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")

        if desired in {"openai", "oai"}:
            if openai_key and AsyncOpenAI:
                self._configure_openai(openai_key)
            else:
                logger.warning("LLM_PROVIDER=openai but OPENAI_API_KEY not configured; falling back")
        elif desired in {"gemini", "google"}:
            if gemini_key and genai:
                self._configure_gemini(gemini_key)
            else:
                logger.warning("LLM_PROVIDER=gemini but GEMINI_API_KEY not configured; falling back")

        if self.provider_name == "mock":
            if openai_key and AsyncOpenAI:
                self._configure_openai(openai_key)
            elif gemini_key and genai:
                self._configure_gemini(gemini_key)
            else:
                logger.warning("No LLM provider configured; using static mock responses")

    # ------------------------------------------------------------------
    # Provider configuration helpers
    # ------------------------------------------------------------------
    def _configure_openai(self, api_key: str) -> None:
        if not AsyncOpenAI:  # pragma: no cover - dependency missing
            logger.error("openai package not available; cannot configure OpenAI provider")
            return
        self.openai_client = AsyncOpenAI(api_key=api_key)
        self.provider_name = "openai"
        logger.info("OpenAI LLM provider configured (model=%s)", self.openai_model)

    def _configure_gemini(self, api_key: str) -> None:
        if not genai:  # pragma: no cover - dependency missing
            logger.error("google-generativeai package not available; cannot configure Gemini provider")
            return
        genai.configure(api_key=api_key)
        model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        self.gemini_model = genai.GenerativeModel(model_name)
        self.provider_name = "gemini"
        logger.info("Gemini LLM provider configured (model=%s)", model_name)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def generate_json_array(self, *, prompt: str, timeout: float = 20.0) -> List[Dict[str, Any]]:
        """Generate a JSON array from the configured provider."""
        try:
            if self.provider_name == "openai":
                return await self._generate_openai(prompt=prompt, timeout=timeout)
            if self.provider_name == "gemini":
                return await self._generate_gemini(prompt=prompt, timeout=timeout)
        except Exception as exc:
            logger.exception("LLM provider failure: %s", exc)
            raise LLMProviderError(str(exc))

        raise LLMProviderError("No LLM provider configured")

    async def estimate_credit_cost(self, *, prompt: str, default: int = 1, timeout: float = 10.0) -> int:
        """Estimate credit cost using the active provider."""
        try:
            if self.provider_name == "openai":
                return await self._estimate_openai(prompt=prompt, timeout=timeout)
            if self.provider_name == "gemini":
                return await self._estimate_gemini(prompt=prompt, timeout=timeout)
        except Exception as exc:
            logger.warning("LLM credit estimator failed; falling back to heuristic: %s", exc)

        return default

    # ------------------------------------------------------------------
    # Provider-specific implementations
    # ------------------------------------------------------------------
    async def _generate_openai(self, *, prompt: str, timeout: float) -> List[Dict[str, Any]]:
        if not self.openai_client:
            raise LLMProviderError("OpenAI client not configured")

        response = await asyncio.wait_for(
            self.openai_client.chat.completions.create(
                model=self.openai_model,
                temperature=float(os.getenv("OPENAI_TEMPERATURE", 0.2)),
                messages=[
                    {
                        "role": "system",
                        "content": "You are an assistant that returns only valid JSON arrays with the requested structure."
                    },
                    {"role": "user", "content": prompt},
                ],
            ),
            timeout=timeout,
        )
        text = (response.choices[0].message.content or "").strip()
        return self._parse_json_array(text)

    async def _estimate_openai(self, *, prompt: str, timeout: float) -> int:
        if not self.openai_client:
            raise LLMProviderError("OpenAI client not configured")

        response = await asyncio.wait_for(
            self.openai_client.chat.completions.create(
                model=self.openai_model,
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": "Respond with digits only indicating the credit cost."
                    },
                    {"role": "user", "content": prompt},
                ],
            ),
            timeout=timeout,
        )
        text = (response.choices[0].message.content or "").strip()
        return self._parse_credit_number(text)

    async def _generate_gemini(self, *, prompt: str, timeout: float) -> List[Dict[str, Any]]:
        if not self.gemini_model:
            raise LLMProviderError("Gemini model not configured")

        response = await asyncio.wait_for(
            asyncio.to_thread(self.gemini_model.generate_content, prompt),
            timeout=timeout,
        )
        if not response.text:
            raise LLMProviderError("Empty response from Gemini")
        return self._parse_json_array(response.text)

    async def _estimate_gemini(self, *, prompt: str, timeout: float) -> int:
        if not self.gemini_model:
            raise LLMProviderError("Gemini model not configured")

        response = await asyncio.wait_for(
            asyncio.to_thread(self.gemini_model.generate_content, prompt),
            timeout=timeout,
        )
        if not response.text:
            raise LLMProviderError("Empty response from Gemini")
        return self._parse_credit_number(response.text)

    # ------------------------------------------------------------------
    # Parsing helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _strip_json_fences(text: str) -> str:
        trimmed = text.strip()
        if trimmed.startswith("```json"):
            trimmed = trimmed[7:]
        if trimmed.endswith("```"):
            trimmed = trimmed[:-3]
        return trimmed.strip()

    def _parse_json_array(self, text: str) -> List[Dict[str, Any]]:
        try:
            cleaned = self._strip_json_fences(text)
            data = json.loads(cleaned)
            if isinstance(data, list):
                return data
            raise ValueError("LLM response is not a list")
        except Exception as exc:
            raise LLMProviderError(f"Failed to parse JSON array: {exc}") from exc

    def _parse_credit_number(self, text: str) -> int:
        cleaned = self._strip_json_fences(text)
        digits = "".join(ch for ch in cleaned if ch.isdigit())
        if not digits:
            raise LLMProviderError("No digit found in credit estimation response")
        return int(digits)


llm_provider = LLMProvider()
