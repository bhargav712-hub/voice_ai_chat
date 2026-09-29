"""
LEGACY / DORMANT FILE — NOT IN CURRENT ARCHITECTURE.

This file previously defined request schemas (ChatRequest, Message) for the legacy
HTTP Server-Sent Events endpoint (POST /api/chat-stream).
In the current pure WebSocket streaming architecture (/ws/conversation), conversational
messages and audio packets are handled directly over full-duplex WebSocket frames.
"""
from pydantic import BaseModel
from typing import List, Optional



class Message(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[Message] = []
    conversation_id: Optional[str] = None


