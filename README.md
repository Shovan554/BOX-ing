# BOX-ing: Neural Combat Interface

A high-performance, real-time boxing gesture recognition game using Three.js and MediaPipe.

## 🚀 Tech Stack

- **Frontend**: 
  - **React 19** (Vite)
  - **Three.js** (React Three Fiber & Drei)
  - **Tailwind CSS v4** (Styling)
  - **Framer Motion** (Animations)
  - **MediaPipe Pose** (Client-side landmark tracking)
- **Backend**:
  - **Python / FastAPI** (Modular Architecture)
  - **WebSockets** (Real-time detection engine)
  - **NumPy** (Vector mathematics)
  - **MongoDB** (Data persistence - *Integration in progress*)

## 🛠️ Getting Started

### 1. Run the Backend (Python Detection Engine)
Navigate to the `backend` folder and start the FastAPI server:
```bash
cd backend
pip install -r requirements.txt
python main.py
```
*The engine will be active at `http://127.0.0.1:8000`.*

### 2. Run the Frontend (In the Browser)
Navigate to the `frontend` folder and start the development server:
```bash
cd frontend
npm install
npm run dev
```
*Open [http://localhost:5173](http://localhost:5173) in your browser.*

## 🎮 How to Play
1. Click **Start Game** on the landing page.
2. Select **Camera Test** from the main menu.
3. Allow camera access and stand directly in front of your webcam.
4. **Actions**:
   - **Hit**: Throw a fast punch (Left or Right) away from your body.
   - **Block**: Bring both hands together near your face.
   - **Idle**: Keep hands in guard position to reset.

## 📁 Project Structure
- `/frontend`: React application, Three.js scenes, and MediaPipe hooks.
- `/backend`: FastAPI routes, WebSocket detection logic, and state management.
- `/3D-Models`: Source FBX and GLB files for game characters.
