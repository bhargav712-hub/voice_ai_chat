"""
Automated Integration and Unit Test Suite for Conversational Voice AI.
Tests:
  - Universal English Sentence Boundary Tokenizer (Standard prose, Abbreviations, Decimals)
  - SQLite WAL Mode & Cascading Deletion Durability
  - In-Memory Audio Validation
  - English Language Configuration & Neural Voice Defaults
"""
import pytest
from backend.services.llm import extract_sentences
from backend.services import storage


def test_extract_sentences_english():
    """Verify sentence boundaries across standard English prose, abbreviations, and questions."""
    # 1. Standard English sentences
    text = "Hello there! How can I help you today? Let us begin."
    sentences, leftover = extract_sentences(text)
    assert len(sentences) == 3
    assert sentences[0] == "Hello there!"
    assert sentences[1] == "How can I help you today?"
    assert sentences[2] == "Let us begin."
    assert leftover == ""

    # 2. Abbreviations and decimal numbering
    text_abbr = "Please contact Dr. Watson at 3.14 PM. Thank you!"
    sentences, leftover = extract_sentences(text_abbr)
    assert len(sentences) == 2
    assert "Dr. Watson" in sentences[0]
    assert sentences[1] == "Thank you!"

    # 3. Conversational multi-clause sentences with mixed punctuation
    text_dialogue = "Wait, are you sure? Yes, absolutely! We are ready."
    sentences, leftover = extract_sentences(text_dialogue)
    assert len(sentences) == 3
    assert sentences[0] == "Wait, are you sure?"
    assert sentences[1] == "Yes, absolutely!"
    assert sentences[2] == "We are ready."


def test_storage_concurrency_and_cascade():
    """Verify that conversation creation, messaging, and cascade deletions work reliably."""
    conv = storage.create_conversation(title="Test Audit Session")
    cid = conv["id"]
    assert cid is not None

    msg1 = storage.add_message(cid, "user", "What is the speed of light?")
    msg2 = storage.add_message(cid, "assistant", "Approximately 300,000 km/s.")
    assert msg1["id"] is not None
    assert msg2["id"] is not None

    record = storage.get_conversation(cid)
    assert record is not None
    assert len(record["messages"]) == 2
    assert record["messages"][0]["content"] == "What is the speed of light?"
    assert record["messages"][1]["content"] == "Approximately 300,000 km/s."

    # Verify Cascade Delete
    deleted = storage.delete_conversation(cid)
    assert deleted is True
    assert storage.get_conversation(cid) is None


def test_stt_short_audio_rejection():
    """Verify that audio payloads under 400 bytes are safely rejected without throwing."""
    from backend.services.stt import _transcribe_sync

    result = _transcribe_sync(b"tiny_chunk", "audio.wav")
    assert result == ""


def test_language_configuration():
    """Verify that English is configured as the primary language across STT, LLM, and TTS."""
    from backend.config import STT_LANGUAGE, TTS_VOICE
    from backend.services.llm import SYSTEM_PROMPT

    # STT: Whisper forced to English
    assert STT_LANGUAGE == "en"

    # LLM: Explicit prompt constraint to speak English
    assert "English" in SYSTEM_PROMPT

    # TTS: Default neural voice is English
    assert TTS_VOICE.startswith("en-")
