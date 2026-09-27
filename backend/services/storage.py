"""
Storage Service — SQLite persistence for speech-to-speech conversations.

Tables:
  - conversations: id, title, created_at, updated_at
  - messages: id, conversation_id, role, content, created_at
"""
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Database path in project root/data/conversations.db
DB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "conversations.db")


def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn


def init_db():
    """Initializes the database schema if not already present."""
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
            ON messages(conversation_id)
        """)
        conn.commit()


# Initialize database schema on module import
init_db()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_conversation(title: Optional[str] = None, conv_id: Optional[str] = None) -> Dict[str, Any]:
    """Create a new conversation session."""
    cid = conv_id or str(uuid.uuid4())
    t = title or "New Voice Session"
    now = _now_iso()

    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (cid, t, now, now)
        )
        conn.commit()

    return {"id": cid, "title": t, "created_at": now, "updated_at": now, "messages": []}


def get_conversations() -> List[Dict[str, Any]]:
    """Return all conversation sessions ordered by most recently updated."""
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.id, c.title, c.created_at, c.updated_at,
                   COUNT(m.id) AS message_count,
                   (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at ASC LIMIT 1) AS first_instruction,
                   (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id
            GROUP BY c.id
            ORDER BY c.updated_at DESC
        """)
        rows = cursor.fetchall()

    return [
        {
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "message_count": row["message_count"],
            "first_instruction": row["first_instruction"],
            "last_message": row["last_message"],
        }
        for row in rows
    ]


def get_conversation(conv_id: str) -> Optional[Dict[str, Any]]:
    """Return a single conversation with all its human and AI messages."""
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?",
            (conv_id,)
        )
        conv = cursor.fetchone()
        if not conv:
            return None

        cursor.execute(
            "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
            (conv_id,)
        )
        messages = [
            {
                "id": m["id"],
                "role": m["role"],
                "content": m["content"],
                "created_at": m["created_at"]
            }
            for m in cursor.fetchall()
        ]

    return {
        "id": conv["id"],
        "title": conv["title"],
        "created_at": conv["created_at"],
        "updated_at": conv["updated_at"],
        "messages": messages,
    }


def add_message(conv_id: str, role: str, content: str) -> Dict[str, Any]:
    """Append a human voice instruction or AI spoken response to a conversation."""
    # Ensure conversation exists
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, title FROM conversations WHERE id = ?", (conv_id,))
        conv = cursor.fetchone()
        now = _now_iso()

        if not conv:
            # Auto-create if not existing
            title = content[:40].strip() or "Voice Session"
            cursor.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (conv_id, title, now, now)
            )
        else:
            # If title is generic and this is first user message, update title
            if conv["title"] in ("New Voice Session", "Voice Session") and role == "user":
                new_title = content[:45].strip()
                if new_title:
                    cursor.execute(
                        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                        (new_title, now, conv_id)
                    )
            else:
                cursor.execute(
                    "UPDATE conversations SET updated_at = ? WHERE id = ?",
                    (now, conv_id)
                )

        msg_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (msg_id, conv_id, role, content, now)
        )
        conn.commit()

    return {"id": msg_id, "conversation_id": conv_id, "role": role, "content": content, "created_at": now}


def delete_conversation(conv_id: str) -> bool:
    """Delete a conversation and its messages."""
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
        cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        conn.commit()
        return cursor.rowcount > 0
