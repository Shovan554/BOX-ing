# BOX-ing: Neural Combat Interface

**BOX-ing** is a high-performance, real-time boxing gesture recognition game that leverages **Computer Vision** and **3D Web Graphics** to create an immersive fitness-oriented gaming experience. By using your webcam, the system detects your movements—punches, blocks, and evasions—and translates them into actions performed by your in-game Ninja avatar.

## ✨ Core Features
- **Real-time Gesture Detection**: Low-latency recognition of jabs, hooks, and blocks using MediaPipe.
- **POV & Third-Person Modes**: Test your animations and perspective in a dedicated testing environment.
- **Progressive Web App**: Smooth 60FPS performance on modern browsers.
- **Global Leaderboard**: Compete with others for the highest combat efficiency score.

## 🚀 Tech Stack

### Frontend
- **React 19 & Vite**: Ultra-fast development and build pipeline.
- **Three.js (React Three Fiber & Drei)**: 3D engine for rendering characters and environments.
- **MediaPipe Pose**: Client-side neural network for landmark tracking.
- **Tailwind CSS v4**: Modern, utility-first styling for the HUD and menus.
- **Lucide React**: Clean, consistent iconography.

### Backend
- **Python 3.11+ & FastAPI**: High-performance asynchronous API framework.
- **WebSockets**: Bi-directional communication for real-time detection data.
- **NumPy**: Vector mathematics for skeletal analysis and gesture calculation.
- **MongoDB Atlas**: Cloud-hosted NoSQL database for user profiles and leaderboards.

## 🛠️ Requirements & Setup

### Prerequisites
- **Node.js 18+** & **npm 9+**
- **Python 3.11+**
- **Webcam** (Required for gesture detection)

### 1. Backend Initialization
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Frontend Initialization
```bash
cd frontend
npm install
npm run dev
```

## 📁 Project Structure
- `/frontend`: React application, Three.js components, and MediaPipe hooks.
- `/backend`: FastAPI routes, WebSocket logic, and MongoDB integration.
- `/MODEL_ACTIONS.md`: Documentation for the Ninja avatar's animation states.
- `/public/assets/models`: GLB assets including the `ninja.glb`.
