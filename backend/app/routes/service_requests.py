"""Service request routes — customers ring for waiter, cleaner, bill, etc."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.database import get_database
from app.websockets.kitchen import manager
from app.routes.tasks import _generate_task_id, _serialize
from app.util import utcnow

router = APIRouter(prefix="/api/service-requests", tags=["service-requests"])


class ServiceRequestCreate(BaseModel):
    table_number: str
    request_type: str   # "waiter" | "cleaner" | "bill" | "napkins" | "emergency"
    note: Optional[str] = None


@router.post("", status_code=201)
async def create_service_request(payload: ServiceRequestCreate):
    db = get_database()
    
    # Map request types to standard task titles and roles
    if payload.request_type == "cleaner":
        title = "Cleaning request"
        role = "cleaner"
        priority = "medium"
    elif payload.request_type == "emergency":
        title = "Emergency"
        role = "manager"
        priority = "high"
    elif payload.request_type == "napkins":
        title = "Extra Napkins"
        role = "server"
        priority = "low"
    elif payload.request_type == "bill":
        title = "Bill request"
        role = "server"
        priority = "medium"
    else:
        title = "Server assistance"
        role = "server"
        priority = "medium"

    table_num = int(payload.table_number) if str(payload.table_number).isdigit() else None
    now = utcnow()

    task_dict = {
        "task_id": _generate_task_id(),
        "title": title,
        "description": f"Instant Service Request: {payload.request_type}",
        "assigned_to": "unassigned",
        "role": role,
        "priority": priority,
        "status": "pending",
        "table_number": table_num,
        "due_time": None,
        "notes": payload.note,
        "created_at": now,
        "updated_at": now,
        "created_by": f"table_{payload.table_number}",
    }

    result = await db.tasks.insert_one(task_dict)
    task_dict["_id"] = str(result.inserted_id)
    
    # Format and broadcast exactly as tasks.py does
    serialized = _serialize(task_dict)
    await manager.broadcast_to_kitchen({"type": "task_update", "data": serialized})
    
    return {"id": str(result.inserted_id), "status": "pending"}


@router.get("")
async def list_service_requests(status: Optional[str] = None):
    db = get_database()
    query = {}
    if status:
        query["status"] = status
    cursor = db.service_requests.find(query).sort("created_at", -1).limit(50)
    items = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        doc["created_at"] = doc["created_at"].isoformat() if doc.get("created_at") else None
        doc["resolved_at"] = doc["resolved_at"].isoformat() if doc.get("resolved_at") else None
        items.append(doc)
    return {"requests": items}


@router.patch("/{request_id}/resolve")
async def resolve_service_request(request_id: str):
    from bson import ObjectId
    db = get_database()
    
    # Check if request_id is an ObjectId (legacy) or task_id
    query = {"_id": ObjectId(request_id)} if ObjectId.is_valid(request_id) else {"task_id": request_id}
    
    now = utcnow()
    await db.tasks.update_one(
        query,
        {"$set": {"status": "completed", "updated_at": now}},
    )
    
    # Broadcast resolution to dashboards
    task = await db.tasks.find_one(query)
    if task:
        serialized = _serialize(task)
        await manager.broadcast_to_kitchen({"type": "task_update", "data": serialized})
        
    return {"status": "resolved"}
