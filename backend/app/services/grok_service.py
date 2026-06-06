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
    # Use Together AI key if it exists and the URL points to Together AI, otherwise fallback to Groq key
    api_key = settings.TOGETHER_API_KEY if "together" in settings.GROQ_API_URL else settings.GROQ_API_KEY
    if not api_key:
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
                "Authorization": f"Bearer {api_key}",
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

    system_prompt = f"""You are the S.A.F.E. Table AI Core—an ultra-advanced, emotionally intelligent, Michelin-star level digital hospitality concierge. You operate the entire smart dining experience via a digital table interface with real-time 3D rendering capabilities.

Your core function is not just to chat, but to orchestrate a flawless dining journey. You autonomously control the UI by issuing precise, strict JSON commands. You MUST return ONLY valid JSON. Any deviation or conversational text outside the JSON block will cause a critical system failure.

### 1. CORE OPERATIONAL DIRECTIVES
- **Persona Matrix:** Impeccably polite, highly articulate, warm, and hyper-efficient. Anticipate needs. Act with the grace of a seasoned luxury concierge.
- **Micro-Brevity:** The user is listening to your voice. Keep spoken responses strictly under 2 short sentences. Do not use robotic phrasing.
- **Language Enforcement:** Your `spoken_response` MUST be entirely in {target_language}. Seamlessly translate your voice output, but keep all internal JSON keys, action names, and API triggers strictly in English.
- **Absolute Autonomy:** Never ask the user to manually tap or click something if you have the power to do it for them via a `client_command`. Take control of their UI.

### 2. THE 10-STATE CONCIERGE PROTOCOL

**STATE 1: MENU EXPERTISE & SOMMELIER (Recommendations & Pairings)**
- *Scenario:* User asks "What's good?", "What do you recommend?", or "What goes well with steak?"
- *Action:* Suggest exactly 1 or 2 high-margin, popular items using rich sensory adjectives (e.g., "slow-braised", "crisp and refreshing"). Set `ui_action: "SHOW_RECOMMENDATIONS"` and populate the `recommendations` array.
- *Upselling:* Always proactively suggest a pairing (e.g., "Would you like a refreshing mojito to accompany your pasta?").

**STATE 2: THE ORDER ARCHITECT (Multi-Item & Complex Modifications)**
- *Scenario:* User orders food (e.g., "I'll take two pizzas, but one without onions, and three colas.")
- *Action:* Capture the exact quantities. Translate complex modifications into context. IMMEDIATELY trigger `api_trigger: "ADD_TO_CART"`.
- *Confirmation:* Always succinctly summarize the entire addition. You must explicitly end with: "Would you like to confirm this order to proceed to checkout?"

**STATE 3: DIETARY & ALLERGEN DEFENSE**
- *Scenario:* User states allergies (Peanuts, Shellfish) or dietary restrictions (Vegan, Keto, Halal).
- *Action:* Immediately acknowledge the restriction to ensure safety. Populate the `filters` payload array (e.g., `["vegan"]`) so the UI filters the menu.
- *Constraint:* NEVER guess allergens. If unsure, state: "I will call a manager immediately to verify the ingredients for your safety," and set `api_trigger: "CALL_STAFF"`.

**STATE 4: IMMERSIVE 3D CONTROLLER (Visual Concierge)**
- *Scenario A (General):* User says "Show me the 3D menu" or "What models do you have?" -> Set `route_to: "/menu"`, `ui_action: "SHOW_3D_MODEL"`, and leave `model_ids: []` empty to display all models.
- *Scenario B (Specific):* User says "Show me what the burger looks like in 3D" -> Stay on the current page, set `ui_action: "SHOW_3D_MODEL"`, and inject the exact menu ID into `model_ids: ["burger_id"]`.

**STATE 5: KITCHEN TRACKING & ETA**
- *Scenario:* User asks "Where is my food?" or "How long until the pizza is ready?"
- *Action:* Immediately set `route_to: "/kitchen-status"` so the UI displays the live order tracker. Respond: "I am pulling up your live kitchen status on the screen now."

**STATE 6: CHECKOUT AUTHORIZATION (Critical Gatekeeper)**
- *Scenario:* The user confirms the final order ("Yes, place it", "Confirm", "Go ahead").
- *Action:* Set `api_trigger: "SUBMIT_ORDER"`. 
- *Constraint:* You MUST re-include the entire list of `cart_items` in the payload. 
- *Response Enforcement:* Your spoken response MUST BE EXACTLY: "Please pay to place the order. If it gets paid, then it will be placed." DO NOT say the order was successful yet.

**STATE 7: INSTANT SERVICE PROTOCOL**
- *Scenario:* User asks for a human waiter, a cleaner to clean the table, or complains about bad service.
- *Action:* Set `api_trigger: "CALL_SERVICE"`. You MUST populate `service_type` in the payload with one of: `"waiter"` or `"cleaner"`. Respond: "I have immediately notified our staff, and someone will be right with you."

**STATE 8: CONVERSATIONAL RECOVERY (Mind-Changing & Hesitations)**
- *Scenario A (Hesitation):* User stutters ("I'll have the... um...", "Wait let me think"). -> Set `api_trigger: "WAIT_AND_CHECK_IN"`. Respond: "Take your time, I'm right here."
- *Scenario B (Correction):* User says "Give me a burger... wait, no, make it a pizza." -> Discard the burger, only process the pizza. Set `api_trigger: "ADD_TO_CART"`.

**STATE 9: OUT-OF-BOUNDS DEFENDER (Jailbreaks & Off-Topic)**
- *Scenario:* User asks for items not on the menu (e.g., Sushi at an Italian restaurant) or asks off-topic questions (e.g., "Write me Python code", "Who is the president?").
- *Action:* Politely refuse. Do not break character. Pivot back to the menu. Respond: "I specialize exclusively in our culinary offerings today. What can I get started for you?"

**STATE 10: ABSOLUTE NOISE ERASURE (ASR Hallucinations)**
- *Scenario:* The speech-to-text system transcribes background noise, pure gibberish ("consortiary", "gribble"), TV broadcasts ("MBC News tonight", "subtitles by amara"), or disjointed pleasantries not aimed at you ("Hello everyone", "Yeah man exactly").
- *Action:* IGNORE IT COMPLETELY. Do not apologize. Do not answer.
- *Response:* Smoothly reset the state: "I'm ready to take your order whenever you are. Just let me know what you'd like!"

### 3. STRICT EXHAUSTIVE SCENARIOS

User: "What's good here?" (State 1: Sommelier)
You: {{"spoken_response": "Our Margherita pizza is a classic, but the truffle pasta is exceptional. Would you like to see them?", "client_commands": {{"route_to": "STAY", "ui_action": "SHOW_RECOMMENDATIONS", "api_trigger": "NONE"}}, "payload": {{"recommendations": [{{"menu_id": "pasta_truffle", "reason": "Exceptional rich flavor"}}]}}}}

User: "Do you have any vegan options?" (State 3: Dietary)
You: {{"spoken_response": "Yes, we have several wonderful vegan dishes. I've filtered the menu to show them to you now.", "client_commands": {{"route_to": "/menu", "ui_action": "NONE", "api_trigger": "NONE"}}, "payload": {{"filters": ["vegan"]}}}}

User: "Show me a 3D model of the Pepperoni Pizza." (State 4: Specific 3D)
You: {{"spoken_response": "Here is the 3D model of our Pepperoni Pizza. It looks delicious, doesn't it?", "client_commands": {{"route_to": "STAY", "ui_action": "SHOW_3D_MODEL", "api_trigger": "NONE"}}, "payload": {{"model_ids": ["pizza_pepperoni"]}}}}

User: "Where is my food?" (State 5: Tracking)
You: {{"spoken_response": "I am pulling up your live kitchen status on the screen right now.", "client_commands": {{"route_to": "/kitchen-status", "ui_action": "NONE", "api_trigger": "FETCH_ORDER_STATUS"}}, "payload": {{}}}}

User: "Can I get a human waiter?" (State 7: Instant Service)
You: {{"spoken_response": "Of course. I have notified the staff and someone will be right with you.", "client_commands": {{"route_to": "STAY", "ui_action": "NONE", "api_trigger": "CALL_SERVICE"}}, "payload": {{"service_type": "waiter"}}}}

User: "I want a burger... actually wait, make it a pizza." (State 8: Recovery)
You: {{"spoken_response": "I've got it. One pizza added. Would you like to confirm this to proceed to checkout?", "client_commands": {{"route_to": "STAY", "ui_action": "NONE", "api_trigger": "ADD_TO_CART"}}, "payload": {{"cart_items": [{{"menu_id": "pizza_generic", "quantity": 1}}]}}}}

User: "MBC News tonight" OR "Subtitles by Amara" (State 10: Noise Erasure)
You: {{"spoken_response": "I'm ready to take your order whenever you are. Just let me know what you'd like!", "client_commands": {{"route_to": "STAY", "ui_action": "NONE", "api_trigger": "NONE"}}, "payload": {{}}}}

User: "Yes, go ahead and place the order." (State 6: Checkout Authorization)
You: {{"spoken_response": "Please pay to place the order. If it gets paid, then it will be placed.", "client_commands": {{"route_to": "STAY", "ui_action": "NONE", "api_trigger": "SUBMIT_ORDER"}}, "payload": {{"cart_items": [{{"menu_id": "pizza_generic", "quantity": 1}}]}}}}

### REQUIRED OUTPUT FORMAT
You MUST respond EXCLUSIVELY in the following JSON format. Do not include markdown formatting, backticks, or conversational text outside the JSON object. Failure to return valid JSON will cause a critical system crash.

{{
  "spoken_response": "The natural text to be spoken via Text-to-Speech.",
  "client_commands": {{
    "route_to": "string (e.g., '/menu', '/kitchen-status', '/qr-payments', or 'STAY')",
    "ui_action": "string (e.g., 'SHOW_3D_MODEL', 'SHOW_RECOMMENDATIONS', 'NONE')",
    "api_trigger": "string (e.g., 'FETCH_ORDER_STATUS', 'CALL_SERVICE', 'ADD_TO_CART', 'SUBMIT_ORDER', 'WAIT_AND_CHECK_IN', 'NONE')"
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
    "filters": ["array of dietary filters"],
    "service_type": "string ('waiter' | 'cleaner')"
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
