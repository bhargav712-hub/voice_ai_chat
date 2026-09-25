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
    "You are a concise, friendly spoken voice assistant. "
    "Keep answers under 2–3 sentences and highly conversational. "
    "Respond in plain spoken language — no markdown, no bullet points, no code blocks."
)

_async_client: AsyncGroq | None = AsyncGroq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


def extract_sentences(buffer: str) -> tuple[list[str], str]:
    """Extract complete sentence chunks from a streaming buffer, handling abbreviations & numbered lists."""
    sentences = []
    while True:
        found = False
        for m in re.finditer(r'([.!?]+)(?:\s+|$)', buffer):
            cand = buffer[:m.end()].strip()
            # Avoid splitting on list items like '1.' or abbreviations like 'Dr.', 'Mr.', 'e.g.'
            if re.fullmatch(r'^\d+\.$', cand) or re.search(r'\b(e\.g|i\.e|dr|mr|mrs)\.$', cand, re.I):
                continue
            if len(cand) >= 4 and re.search(r'[a-zA-Z]{2,}', cand):
                sentences.append(cand)
                buffer = buffer[m.end():]
                found = True
                break
        if not found:
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
    messages.extend(history)
    messages.append({"role": "user", "content": message})

    stream = await _async_client.chat.completions.create(
        model=GROQ_LLM_MODEL,
        messages=messages,
        max_tokens=150,
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

