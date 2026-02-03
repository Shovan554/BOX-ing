import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "shadowboxing_dev")

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI is not set. Put it in your .env file")

client = MongoClient(MONGODB_URI)
db = client[DB_NAME]

users_col = db["users"]
sessions_col = db["sessions"]
events_col = db["events"]
