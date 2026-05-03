# db_users.py

from typing import Optional, Dict, Any
from bson import ObjectId
from database.datab import users_col


def _normalize_user(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    doc["id"] = str(doc["_id"])
    doc.pop("_id", None)
    return doc


async def db_get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    doc = await users_col.find_one({"email": email.lower().strip()})
    return _normalize_user(doc)


async def db_create_user(email: str, hashed_password: str, display_name: str) -> Dict[str, Any]:
    doc = {
        "email": email.lower().strip(),
        "hashed_password": hashed_password,
        "display_name": display_name.strip(),
    }
    result = await users_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _normalize_user(doc)


async def db_get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    if not ObjectId.is_valid(user_id):
        return None
    doc = await users_col.find_one({"_id": ObjectId(user_id)})
    return _normalize_user(doc)


async def db_update_display_name(user_id: str, display_name: str) -> Optional[Dict[str, Any]]:
    if not ObjectId.is_valid(user_id):
        return None
    await users_col.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"display_name": display_name.strip()}},
    )
    return await db_get_user_by_id(user_id)


async def db_update_password(user_id: str, hashed_password: str) -> bool:
    if not ObjectId.is_valid(user_id):
        return False
    result = await users_col.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"hashed_password": hashed_password}},
    )
    return result.modified_count == 1