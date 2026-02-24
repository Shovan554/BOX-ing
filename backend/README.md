# BOX-ing Backend

Modular FastAPI backend for real-time gesture detection and session management.

## Prerequisites
- Python 3.8+
- pip

## Setup & Execution

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Server**:
   ```bash
   python main.py
   ```

## Modular Structure
- `main.py`: Entry point and middleware configuration.
- `state.py`: Centralized state (Sessions, Leaderboard) and shared helpers.
- `routes/`:
  - `detection.py`: WebSocket-based real-time jab and block detection.
  - `sessions.py`: REST endpoints for session initialization and leaderboard data.

## API Endpoints
- **GET** `/`: Health check.
- **POST** `/session/start`: Initialize a new game session.
- **GET** `/leaderboard`: Retrieve high scores.
- **WS** `/ws/detect/{session_id}`: Real-time landmark processing.
