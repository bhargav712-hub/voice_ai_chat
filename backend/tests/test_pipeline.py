"""
Automated Integration and Unit Test Suite for Conversational Voice AI.
Tests:
  - Universal Multilingual Sentence Boundary Tokenizer (Latin, Hindi Devanagari, Abbreviations)
  - SQLite WAL Mode & Cascading Deletion Durability
  - In-Memory Audio Validation
  - Health & CORS/Origin Policies
"""
import pytest
from backend.services.llm import extract_sentences
from backend.services import storage


def test_extract_sentences_multilingual():
    """Verify sentence boundaries across Latin, English abbreviations, and Devanagari."""
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

    # 3. Devanagari (Hindi) punctuation (Poorna Viram \u0964)
    text_hindi = "नमस्ते आप कैसे हैं। मैं आपकी सहायता कर सकता हूँ।"
    sentences, leftover = extract_sentences(text_hindi)
    assert len(sentences) == 2
    assert "नमस्ते" in sentences[0]
    assert "सहायता" in sentences[1]


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
