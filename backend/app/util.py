"""Project-wide utilities. Keep tiny and dependency-free."""
from datetime import datetime
from zoneinfo import ZoneInfo

def utcnow() -> datetime:
    """Single source of truth for 'now'. Returns Asia/Karachi time."""
    return datetime.now(ZoneInfo("Asia/Karachi"))
