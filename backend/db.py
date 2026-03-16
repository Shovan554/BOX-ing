'''This module sets up the connection to the MongoDB database and defines the collections used in the application.
It uses the `pymongo` library to connect to MongoDB and the `dotenv` library to load environment variables from a `.env` file.
The MongoDB URI and database name are read from environment variables, and the collections for users, sessions, 
events, and leaderboard are initialized for use in the application.'''

import os
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "userdata")

if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI is not set. Put it in your .env file")

client = MongoClient(MONGODB_URI)
db = client[DB_NAME]

users_col = db["users"]
sessions_col = db["sessions"]
rooms_col = db["rooms"]
events_col = db["events"]
leaderboard_col = db["leaderboard"]
