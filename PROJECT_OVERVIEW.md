# BOX-ing: Project Overview

BOX-ing is a real-time, gesture-controlled multiplayer boxing game that uses your webcam as the game controller. No special hardware is required—just your body.

## 🥊 How It Works

1.  **Gesture Detection**: The game uses your webcam to track your body movements. Using AI models, it identifies specific points (landmarks) on your face and arms.
2.  **Combat Logic**:
    *   **Punching**: When you extend your arm across your body, the game recognizes it as a punch.
    *   **Blocking**: Bringing your hands near your face activates a defensive block.
    *   **Bowing**: At the start of a match, players automatically bow to show respect before fighting.
3.  **Multiplayer Sync**: Your movements are sent instantly to your opponent using "WebSockets." This allows both players to see each other's actions in real-time. If you punch and your opponent isn't blocking, they take a hit!

## 🛠 Technology Stack

### Frontend (The Game Client)
*   **React & Vite**: The core framework used to build the user interface.
*   **Three.js (React Three Fiber)**: Powers the 3D graphics, rendering the ninja models and the combat arena.
*   **MediaPipe (Google)**: The AI engine that performs "Pose Estimation" to track your body through the webcam.
*   **Framer Motion**: Handles the smooth animations and UI transitions (like the "FIGHT!" text).
*   **Lucide React**: Provides the modern icons used throughout the menus.

### Backend (The Game Server)
*   **FastAPI (Python)**: A high-performance server that handles user accounts, matchmaking, and game sessions.
*   **WebSockets**: Used for the ultra-low latency connection required for real-time combat.
*   **MongoDB**: The database used to store user profiles, leaderboard scores, and room information.

## 🚀 Key Features
*   **Matchmaking**: Players can join a queue to find random opponents.
*   **Private Rooms**: Create a 6-digit room code to invite a friend to a private duel.
*   **Real-time Interaction**: Actions like hitting or blocking are synced between players with high accuracy.
*   **Perspective View**: The game uses a "Point of View" (POV) camera system to make you feel like you're actually in the arena.
