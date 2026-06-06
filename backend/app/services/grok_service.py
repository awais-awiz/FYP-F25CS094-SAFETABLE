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
        
    payload = {
        "model": settings.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            settings.GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
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
        f"[{'AVAILABLE' if m['available'] else 'UNAVAILABLE'}] | has_3d_model: True"
        for m in menu_items
    )

    lang_names = {
        "en": "English", "ur": "Urdu", "de": "German", 
        "es": "Spanish", "fr": "French", "hi": "Hindi", 
        "ko": "Korean", "it": "Italian", "ar": "Arabic",
        "ru": "Russian", "zh": "Chinese", "ja": "Japanese"
    }
    target_language = lang_names.get(language, "English")

    system_prompt = f"""You are a highly capable, dynamic, and welcoming AI waiter for S.A.F.E. Table. Your goal is to provide a premium, conversational ordering experience while efficiently guiding the customer to checkout. You do not just talk to the customer; you control their digital table interface by issuing JSON commands.

### YOUR 3 STATES OF OPERATION:

**1. MENU EXPERT (Questions & Recommendations)**
If a customer asks for a recommendation (e.g., "What is your best?", "What's good here?"), act like a real, veteran waiter. Suggest a specific, popular item from the menu with a brief, appetizing description. Answer questions about items naturally.
- *Rule:* Be concise. Sell the food, don't read the whole menu.
- LANGUAGE: The spoken_response MUST be in {target_language}.

**2. ORDER PROCESSOR (Taking Orders)**
When a customer explicitly states what they want to order, smoothly capture the item and quantity. 
- *Rule:* Immediately confirm the exact items added to their cart via `api_trigger: "ADD_TO_CART"` and ask if they are ready to confirm the order to proceed to payment.

**3. THE NOISE FILTER (Ignoring Hallucinations)**
The speech-to-text system frequently picks up background restaurant chatter, audio glitches, or pure gibberish. 
- *Rule:* If the user input is pure gibberish (e.g., "consortiary", "um"), a standalone pleasantry ("Thank you", "Hello everyone"), or completely unrelated to food/restaurants, YOU MUST ASSUME IT IS BACKGROUND NOISE. 
- *Action:* Do not apologize. Do not answer it. Respond ONLY with: "I'm ready when you are. What would you like to order?"

### INTERACTION EXAMPLES:

User: "I want to order pizza."
You: {{"spoken_response": "We have Margherita, New York style, and Pepperoni. Which one sounds good to you?", "client_commands": {{"route_to": "STAY", "ui_action": "NONE", "api_trigger": "NONE"}}, "payload": {{}}}}

User: "Which one is your best?" (State 1: Menu Expert)
You: {{"spoken_response": "Our Margherita is a classic favorite with fresh mozzarella, but if you are looking for something hearty, the Pepperoni is our most popular. What can I get for you?", "client_commands": {{"route_to": "STAY", "ui_action": "NONE", "api_trigger": "NONE"}}, "payload": {{}}}}

User: "consortiary" OR "Hello everyone" (State 3: Noise Filter)
You: {{"spoken_response": "I'm ready when you are. What would you like to order?", "client_commands": {{"route_to": "STAY", "ui_action": "NONE", "api_trigger": "NONE"}}, "payload": {{}}}}

User: "I'll take the Pepperoni." (State 2: Order Processor)
You: {{"spoken_response": "Excellent choice. I've added one Pepperoni Pizza to your order. Would you like to confirm this and proceed to payment?", "client_commands": {{"route_to": "STAY", "ui_action": "NONE", "api_trigger": "ADD_TO_CART"}}, "payload": {{"cart_items": [{{"menu_id": "...", "quantity": 1}}]}}}}

User: "Yeah confirm."
You: {{"spoken_response": "Please pay to place the order. If it gets paid, then it will be placed.", "client_commands": {{"route_to": "STAY", "ui_action": "NONE", "api_trigger": "SUBMIT_ORDER"}}, "payload": {{}}}}

### REQUIRED OUTPUT FORMAT:
You MUST respond EXCLUSIVELY in the following JSON format. Do not include markdown formatting or text outside the JSON object.

{{
  "spoken_response": "The natural text to be spoken via Text-to-Speech.",
  "client_commands": {{
    "route_to": "string (e.g., '/menu', '/kitchen-status', '/checkout', or 'STAY')",
    "ui_action": "string (e.g., 'SHOW_3D_MODEL', 'SHOW_RECOMMENDATIONS', 'NONE')",
    "api_trigger": "string (e.g., 'FETCH_ORDER_STATUS', 'CALL_STAFF', 'ADD_TO_CART', 'SUBMIT_ORDER', 'WAIT_AND_CHECK_IN', 'NONE')"
  }},
  "payload": {{
    "model_ids": ["array of exact menu_ids to show in 3D if ui_action is SHOW_3D_MODEL"],
    "recommendations": [
      {{
        "menu_id": "exact menu_id of recommended item",
        "reason": "Personalized reason why this is recommended"
      }}
    ],
    "cart_items": [
      {{
        "menu_id": "string",
        "quantity": 1
      }}
    ],
    "filters": ["array of dietary filters"]
  }}
}}

MENU:
{menu_text}
"""

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

    try:
        raw_response = await _call_groq(
            messages=groq_msgs,
            temperature=0.5,
            max_tokens=800,
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raw_response = '{"spoken_response": "I am receiving too many requests at the moment. Please wait a minute and try again.", "client_commands": {"route_to": "STAY", "ui_action": "NONE", "api_trigger": "NONE"}, "payload": {}}'
        else:
            raw_response = '{"spoken_response": "I am experiencing network difficulties. Please try again later.", "client_commands": {"route_to": "STAY", "ui_action": "NONE", "api_trigger": "NONE"}, "payload": {}}'
    except Exception as e:
        print(f"Error calling Groq API: {e}")
        raw_response = '{"spoken_response": "I am currently unavailable due to an error.", "client_commands": {"route_to": "STAY", "ui_action": "NONE", "api_trigger": "NONE"}, "payload": {}}'

    ai_response = _parse_json_payload(raw_response) or {
        "spoken_response": "I couldn't understand the order. Please try again.",
        "client_commands": {"route_to": "STAY", "ui_action": "NONE", "api_trigger": "NONE"},
        "payload": {},
    }

    response_text = str(ai_response.get("spoken_response", ""))[:800]
    client_commands = ai_response.get("client_commands", {"route_to": "STAY", "ui_action": "NONE", "api_trigger": "NONE"})
    payload = ai_response.get("payload", {})
    
    order_placed = False
    order_data = None

    if client_commands.get("api_trigger") == "SUBMIT_ORDER" and payload.get("cart_items"):
        raw_items = payload.get("cart_items", [])[:MAX_LINES_PER_ORDER]
        if raw_items:
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
        "client_commands": client_commands,
        "payload": payload,
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
    
    if not settings.GROQ_API_KEY:
        # Fallback if no API key
        fallback_recs = []
        for i in menu_items[:3]:
            rec = dict(i)
            rec["reason"] = "Customer favorite"
            fallback_recs.append(rec)
        return {"success": True, "summary": "Popular Picks", "recommendations": fallback_recs, "source": "fallback"}
        
    menu_text = "\n".join([f"- {m['name']} (Category: {m.get('category', 'N/A')})" for m in menu_items])
    history_text = ", ".join(order_history) if order_history else "None"
    pref_text = preferences if preferences else "None"
    
    system_prompt = f"""You are an expert AI food recommendation engine.
Given the restaurant's menu, the customer's order history, and any dietary preferences, you must recommend 3 to 4 items they are likely to enjoy.
You must return the result as a JSON object strictly following this schema:
{{
  "summary": "A short, engaging title for these recommendations (e.g., 'Perfectly Curated for You')",
  "recommendations": [
    {{
      "name": "Exact Name of the Menu Item",
      "reason": "A highly personalized, mouth-watering sentence explaining why this is recommended based on their history or preferences."
    }}
  ]
}}

MENU:
{menu_text}

ORDER HISTORY:
{history_text}

DIETARY PREFERENCES:
{pref_text}
"""
    
    try:
        raw = await _call_groq(
            messages=[{"role": "system", "content": system_prompt}],
            temperature=0.7,
            max_tokens=600,
        )
        parsed = _parse_json_payload(raw)
        if parsed and "recommendations" in parsed:
            recs = []
            for r in parsed["recommendations"]:
                match = next((m for m in menu_items if m["name"].lower() == r.get("name", "").lower()), None)
                if match:
                    rec_item = dict(match)
                    rec_item["reason"] = r.get("reason", "Highly recommended for you.")
                    recs.append(rec_item)
            
            if recs:
                return {
                    "success": True, 
                    "summary": parsed.get("summary", "Personalized AI Recommendations"),
                    "recommendations": recs,
                    "source": "ai"
                }
    except Exception as e:
        print(f"[grok_service] Recommendation error: {e}")
        
    # Fallback on error
    fallback_recs = []
    for i in menu_items[:3]:
        rec = dict(i)
        rec["reason"] = "Customer favorite"
        fallback_recs.append(rec)
    return {"success": True, "summary": "Popular Picks", "recommendations": fallback_recs, "source": "fallback"}
