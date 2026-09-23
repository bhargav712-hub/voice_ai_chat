from pydantic import BaseModel
from typing import List, Optional



class Message(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[Message] = []
    conversation_id: Optional[str] = None



class ChatResponse(BaseModel):
    reply: str
