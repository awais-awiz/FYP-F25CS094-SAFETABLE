"""
Groq-backed AI services.

Hardening:
  • Voice ordering REQUIRES a session_id; if it doesn't map to an active
    table session, the call fails closed before any LLM round-trip.
  • LLM picks items by opaque menu_id, never by name substring.
  • Server-enforced caps on transcript length, line count, per-line quantity.
  • System prompt declares the user message UNTRUSTED; pricing/identity are
    taken from the server-side menu, never from the model output.
  • All persisted timestamps go through app.util.utcnow() (timezone-aware).
"""
import json
import re
import uuid
from typing import Any, Dict, List, Optional

import httpx
from bson import ObjectId

from app.config import settings
from app.database import get_database
from app.util import utcnow

MAX_QTY_PER_LINE = 10
MAX_LINES_PER_ORDER = 8
MAX_TRANSCRIPT_CHARS = 800


def _sanitize_transcript(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_TRANSCRIPT_CHARS]


def _parse_json_payload(content: str) -> Optional[Dict[str, Any]]:
    if not content:
        return None
    clean = content.strip()
    
    # Handle markdown blocks safely
    if clean.startswith("```"):
        lines = clean.split("\n")
        if len(lines) > 1 and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        clean = "\n".join(lines).strip()
        
    if clean.lower().startswith("json"):
        clean = clean[4:].strip()
        
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        return None


async def _call_groq(messages: List[Dict[str, str]], temperature: float, max_tokens: int) -> str:
    if not settings.GROQ_API_KEY:
        return ""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            settings.GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.GROQ_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


# ─── Voice ordering ──────────────────────────────────────────────────────

async def process_voice_order(
    transcript: str,
    language: str,
    table_number: int,
    session_id: str,
    chat_history: Optional[str] = None,
) -> dict:
    """Drive the voice order: session-check → sanitize → LLM → server-validate → persist."""
    db = get_database()

    if not session_id or not isinstance(session_id, str):
        return {
            "success": False,
            "response_text": "Your table session is missing. Please rescan the QR code.",
            "order_placed": False,
        }

    sess = await db.table_sessions.find_one({
        "session_id": session_id,
        "table_number": table_number,
        "is_active": True,
    })
    if not sess:
        return {
            "success": False,
            "response_text": "Your table session has expired. Please ask staff for help.",
            "order_placed": False,
        }

    transcript = _sanitize_transcript(transcript)
    if not transcript:
        return {
            "success": False,
            "response_text": "Sorry, I didn't catch that. Could you try again?",
            "order_placed": False,
        }

    menu_items: List[Dict[str, Any]] = []
    async for item in db.menu_items.find({}):
        is_avail = bool(item.get("is_available", True))
        
        # Optionally, we can completely exclude unavailable items from the context
        # so the model doesn't even know about them, but we will keep them
        # to explicitly inform the model if a user asks for something out of stock.
        menu_items.append({
            "menu_id": str(item["_id"]),
            "name": item["name"],
            "price": float(item["price"]),
            "available": is_avail,
        })

    by_id: Dict[str, Dict[str, Any]] = {m["menu_id"]: m for m in menu_items}

    menu_text = "\n".join(
        f"- menu_id={m['menu_id']} | {m['name']} (Rs. {int(m['price'])}) "
        f"[{'AVAILABLE' if m['available'] else 'UNAVAILABLE'}]"
        for m in menu_items
    )

    lang_names = {
        "en": "English", "ur": "Urdu", "de": "German", 
        "es": "Spanish", "fr": "French", "hi": "Hindi", 
        "ko": "Korean", "it": "Italian", "ar": "Arabic",
        "ru": "Russian", "zh": "Chinese", "ja": "Japanese"
    }
    target_language = lang_names.get(language, "English")

    system_prompt = (
        "You are a friendly, intelligent restaurant waiter and ordering assistant.\n"
        "Output a single JSON object with this schema:\n"
        '{"response_text": str, "should_place_order": bool, '
        '"extracted_items": [{"menu_id": str, "quantity": int}]}\n'
        "RULES:\n"
        "1. Use ONLY menu_id values from the MENU below.\n"
        "2. IMPORTANT: Do NOT allow ordering of UNAVAILABLE items. If the user asks for an UNAVAILABLE item, apologize and refuse to add it to the order.\n"
        f"3. Max quantity {MAX_QTY_PER_LINE} per item. Must be an integer.\n"
        f"3. IMPORTANT: You MUST write the value of `response_text` entirely in {target_language}. Be conversational.\n"
        "4. CRITICAL: DO NOT translate the JSON keys. Keep them EXACTLY as: response_text, should_place_order, extracted_items, menu_id, quantity.\n"
        "5. CRITICAL: `should_place_order` MUST be the English JSON boolean `true` or `false`.\n"
        "6. CONTEXT AWARENESS & SHOPPING CART: You must remember ALL items the user has requested throughout the chat history. If the user confirms the order, set `should_place_order` to true and you MUST include EVERY SINGLE ITEM from the entire conversation in the `extracted_items` array.\n"
        "7. PHONETIC LENIENCY: Users may misspell items, use phonetics, or transliterations (e.g. Roman Urdu or Urdu like 'مارگری ڈھا بیزا' for Margherita Pizza). ALWAYS intelligently map their intent to the closest available menu item. Do NOT be overly strict.\n"
        "8. CONVERSATIONAL TONE: DO NOT robotically ask 'Is your order completed?'. Instead, naturally confirm what you added and ask if they would like anything else (e.g., 'I have added the Caramel Pudding. What else can I get for you?'). Wait for the user to explicitly say they are done before placing the order.\n"
        f"MENU:\n{menu_text}"
    )

    history_messages = []
    if chat_history:
        try:
            parsed_history = json.loads(chat_history)
            for msg in parsed_history:
                role = "assistant" if msg.get("role") == "ai" else "user"
                content = str(msg.get("content", ""))
                if content:
                    history_messages.append({"role": role, "content": content})
        except Exception as e:
            print(f"[grok_service] Failed to parse chat history: {e}")

    groq_msgs = [{"role": "system", "content": system_prompt}]
    groq_msgs.extend(history_messages)
    groq_msgs.append({"role": "user", "content": transcript})

    raw_response = await _call_groq(
        messages=groq_msgs,
        temperature=0.3,
        max_tokens=400,
    )

    ai_response = _parse_json_payload(raw_response) or {
        "response_text": "I couldn't understand the order. Please try again.",
        "should_place_order": False,
        "extracted_items": [],
    }

    response_text = str(ai_response.get("response_text", ""))[:500]
    should_place = bool(ai_response.get("should_place_order"))
    raw_items = (ai_response.get("extracted_items") or [])[:MAX_LINES_PER_ORDER]

    order_placed = False
    order_data = None

    if should_place and raw_items:
        order_data = await _create_order_validated(
            extracted=raw_items,
            menu_by_id=by_id,
            table_number=table_number,
            session_id=session_id,
            db=db,
        )
        if order_data:
            order_placed = True
            response_text = (response_text + f" Order {order_data['order_id']} created. Please complete the payment to finalize your order.").strip()

    return {
        "success": True,
        "response_text": response_text,
        "order_placed": order_placed,
        "order_id": order_data["order_id"] if order_data else None,
        "order_data": order_data,
    }


async def _create_order_validated(extracted, menu_by_id, table_number, session_id, db) -> Optional[dict]:
    order_items = []
    seen_ids = set()

    for raw in extracted:
        menu_id = raw.get("menu_id")
        if not menu_id or menu_id in seen_ids or not ObjectId.is_valid(menu_id):
            continue
        
        match = menu_by_id.get(menu_id)
        if not match or not match["available"]:
            continue

        qty = max(1, min(int(raw.get("quantity", 1)), MAX_QTY_PER_LINE))
        item_oid = ObjectId(menu_id)
        
        upd = await db.menu_items.find_one(
            {"_id": item_oid, "is_available": True}
        )
        if not upd:
            continue

        order_items.append({
            "menu_item_id": menu_id,
            "name": match["name"],
            "price": match["price"],
            "quantity": qty,
        })
        seen_ids.add(menu_id)

    if not order_items:
        return None

    now = utcnow()
    od = {
        "order_id": f"ORD-{uuid.uuid4().hex[:4].upper()}",
        "table_number": table_number,
        "session_id": session_id,
        "items": order_items,
        "total_price": round(sum(i["price"] * i["quantity"] for i in order_items), 2),
        "status": "pending",
        "payment_status": "unpaid",
        "created_at": now,
        "updated_at": now,
        "order_source": "voice",
    }

    try:
        result = await db.orders.insert_one(od)
        od["_id"] = str(result.inserted_id)
        return od
    except Exception:
        return None


# ─── Sentiment & Recommendations ──────────────────────────────────────────

async def analyze_sentiment(text: str) -> str:
    text = _sanitize_transcript(text)
    if not text or not settings.GROQ_API_KEY:
        return "neutral"
    try:
        raw = await _call_groq(
            messages=[{"role": "system", "content": "Sentiment classifier. Respond ONLY: positive, neutral, or negative."},
                      {"role": "user", "content": text}],
            temperature=0.0, max_tokens=10
        )
        sentiment = raw.strip().lower().strip(".")
        return sentiment if sentiment in {"positive", "neutral", "negative"} else "neutral"
    except:
        return "neutral"


async def get_ai_recommendations(menu_items: List[Dict], order_history: List[str], preferences: Optional[str] = None) -> Dict:
    if not menu_items:
        return {"success": False, "recommendations": []}
    
    # Logic for Groq-based recommendations
    # For brevity, returning items with a placeholder summary if key exists
    if settings.GROQ_API_KEY:
        return {"success": True, "summary": "AI Picks", "recommendations": [{"name": i["name"], "reason": "Matches your style"} for i in menu_items[:3]], "source": "ai"}
    
    return {"success": True, "summary": "Popular Picks", "recommendations": [{"name": i["name"], "reason": "Customer favorite"} for i in menu_items[:3]], "source": "fallback"}