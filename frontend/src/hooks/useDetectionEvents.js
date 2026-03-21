import { useState, useEffect, useRef } from 'react';
import { WS_BASE_URL } from '../config/api';

export const ACTIONS = {
  IDLE: 'idle',
  BLOCK: 'block',
  LEFT_HIT: 'left_hit',
  RIGHT_HIT: 'right_hit',
  GOT_HIT: 'got_hit',
  DEFEAT: 'defeat',
  BOW: 'bow'
};

export const useDetectionEvents = (sessionId, isLocked = false) => {
  const [lastEvent, setLastEvent] = useState(null);
  const [handStatus, setHandStatus] = useState({ left: { detected: false, fist: false }, right: { detected: false, fist: false } });
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;

    const connectWs = () => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/detect/${sessionId}`);

      ws.onopen = () => {
        console.log('Detection WS Connected');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.hand_status) {
          setHandStatus(data.hand_status);
        }

        if (isLocked) return;

        if (data.action && data.action !== 'none') {
          let eventType = ACTIONS.IDLE;
          let side = data.side || '';

          if (data.action === 'hit') {
            eventType = side === 'left' ? ACTIONS.LEFT_HIT : ACTIONS.RIGHT_HIT;
          } else if (data.action === 'block') {
            eventType = ACTIONS.BLOCK;
          } else if (data.action === 'idle') {
            eventType = ACTIONS.IDLE;
          }

          setLastEvent({
            type: eventType,
            side: side,
            timestamp: Date.now(),
            raw: data
          });
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWs, 2000);
      };

      wsRef.current = ws;
    };

    connectWs();
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [sessionId, isLocked]);

  const sendLandmarks = (landmarks, handData) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload = {
        landmarks: landmarks.points,
        timestamp: landmarks.timestamp,
        hand_data: handData ? {
          landmarks: handData.landmarks,
          handedness: handData.handedness,
          timestamp: handData.timestamp
        } : null
      };
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  return { lastEvent, handStatus, wsConnected, sendLandmarks };
};
