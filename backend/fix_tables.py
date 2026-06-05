
from app.database import get_database, connect_to_mongo, close_mongo_connection
import asyncio

async def main():
    await connect_to_mongo()
    db = get_database()
    result = await db.table_sessions.update_many({"is_active": True}, {"$set": {"is_active": False}})
    print(f"Closed {result.modified_count} active sessions.")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
