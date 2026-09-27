"""
LLM Service — Conversational response via Groq.

Responsibility:
  - Receive the current user message + prior conversation history.
  - Build the full message array (system + history + current turn).
  - Call the Groq chat completions API (same model as the original CLI).
  - Return the assistant's reply as a plain string.

The Groq SDK is synchronous; wrapped with asyncio.to_thread().

System prompt:
  Kept identical to the original CLI so behaviour is preserved.
  Instruct the LLM to respond in plain spoken language (no markdown)
  since the output goes directly to TTS.
"""
import asyncio
import logging
import re
from typing import List, Dict, AsyncGenerator

from groq import AsyncGroq

from backend.config import GROQ_API_KEY, GROQ_LLM_MODEL

logger = logging.getLogger("voice_ai.llm")

SYSTEM_PROMPT = (
    "You are a friendly, highly intelligent spoken voice assistant. "
    "For standard greetings and small talk, keep answers concise (1–3 conversational sentences). "
    "When the user asks in-depth, technical, or explanatory questions, provide clear, comprehensive explanations "
    "broken into natural, spoken sentences. "
    "Always speak in natural conversational prose — never use markdown symbols, bullet points, asterisks, or code blocks."
)

_async_client: AsyncGroq | None = AsyncGroq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


PUNCTUATION_REGEX = re.compile(r'([.!?\u0964\u0965\u3002]+)(?:\s+|$)')
ABBREVIATIONS = re.compile(r'\b(e\.g|i\.e|dr|mr|mrs|ms|prof|inc|ltd)\.$', re.IGNORECASE)
NUMBERED_LIST = re.compile(r'^\d+\.$')


def extract_sentences(buffer: str) -> tuple[list[str], str]:
    """
    Extract complete sentence chunks from a streaming buffer.
    Supports English, Devanagari (Hindi), CJK, and other scripts without buffer starvation.
    """
    sentences = []
    while True:
        match = PUNCTUATION_REGEX.search(buffer)
        if not match:
            break

        candidate = buffer[:match.end()].strip()
        # Prevent premature splitting on abbreviations and numbering
        if NUMBERED_LIST.match(candidate) or ABBREVIATIONS.search(candidate):
            remaining = buffer[match.end():]
            next_match = PUNCTUATION_REGEX.search(remaining)
            if not next_match:
                break
            candidate = buffer[:match.end() + next_match.end()].strip()
            buffer = buffer[match.end() + next_match.end():]
            sentences.append(candidate)
            continue

        if len(candidate) >= 2:
            sentences.append(candidate)
            buffer = buffer[match.end():]
        else:
            break

    return sentences, buffer


async def stream_sentences(message: str, history: List[Dict]) -> AsyncGenerator[str, None]:
    """
    Stream sentence chunks from Groq LLM as they become available.
    Enables low-latency Time-To-First-Audio by pipelining speech synthesis.
    """
    if not _async_client:
        raise ValueError("GROQ_API_KEY is not configured. Set it in the .env file.")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    # Sliding window: cap to the most recent 12 turns to prevent context overflow & latency bloat
    messages.extend(history[-12:] if history else [])
    messages.append({"role": "user", "content": message})

    stream = await _async_client.chat.completions.create(
        model=GROQ_LLM_MODEL,
        messages=messages,
        max_tokens=1024,  # Increased from 400 to 1024 for in-depth conversations
        temperature=0.7,
        stream=True,
    )

    buffer = ""
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content or ""
        if not delta:
            continue

        buffer += delta
        sentences, buffer = extract_sentences(buffer)
        for s in sentences:
            yield s

    # Flush any remaining text in buffer
    leftover = buffer.strip()
    if leftover:
        yield leftover

