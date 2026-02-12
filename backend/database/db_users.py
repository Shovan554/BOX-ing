# db_users.py

'''This module provides functions to interact with the users collection in the MongoDB database.
It includes functions to create a new user, retrieve a user by email, and retrieve a user by ID.
The module also includes a helper function to normalize the user document by converting the MongoDB ObjectId to a string and removing the original _id field.'''
from typing import Optional, Dict, Any
from bson import ObjectId
from db import users_col

# Helper function to convert MongoDB document to a more JSON-friendly format
def _normalize_user(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    doc["id"] = str(doc["_id"])
    doc.pop("_id", None)
    return doc

# The db_get_user_by_email function retrieves a user document from the users collection based on the provided email address.
def db_get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    doc = users_col.find_one({"email": email.lower().strip()})
    return _normalize_user(doc)

# The db_create_user function creates a new user document in the users collection with the provided email, hashed password, and display name.
def db_create_user(email: str, hashed_password: str, display_name: str) -> Dict[str, Any]:
    doc = {
        "email": email.lower().strip(),
        "hashed_password": hashed_password,
        "display_name": display_name.strip(),
    }
    result = users_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _normalize_user(doc)

# The db_get_user_by_id function retrieves a user document from the users collection based on the provided user ID.
def db_get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    if not ObjectId.is_valid(user_id):
        return None
    doc = users_col.find_one({"_id": ObjectId(user_id)})
    return _normalize_user(doc)