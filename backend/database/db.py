import os
import motor.motor_asyncio
from dotenv import load_dotenv

load_dotenv()

# Load environment variables
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "userdata")

if not MONGODB_URI:
    # Fallback for local dev if .env is missing, but prefer env
    MONGODB_URI = "mongodb+srv://shadowboxer:Boxer101@shadowboxing-userdata.gv1b7nz.mongodb.net/"

client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URI)
db = client[DB_NAME]

leaderboard_col = db["leaderboard"]
users_col = db["users"]
sessions_col = db["sessions"]
events_col = db["events"]

async def check_db_connection():
    try:
        await client.admin.command('ping')
        return True
    except Exception as e:
        print(f"MongoDB connection error: {e}")
        return False
