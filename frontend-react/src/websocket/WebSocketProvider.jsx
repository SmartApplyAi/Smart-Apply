import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { authState, logout } = useAuth();
  const { showToast } = useToast();
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const pingInterval = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const shouldReconnect = useRef(true);

  const connect = async () => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    try {
      // 1. Get one-time ticket
      const { ticket } = await api.post('/ws-ticket');

      // 2. Open websocket using ticket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/realtime?ticket=${ticket}`;

      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        reconnectAttempts.current = 0;

        // Setup ping interval
        pingInterval.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'PING' }));
          }
        }, 30000); // Ping every 30s
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'PONG':
              // Heartbeat acknowledged
              break;
            case 'FORCE_REAUTH':
            case 'SESSION_REVOKED':
              shouldReconnect.current = false; // Prevent raccoon behavior
              socket.close();
              showToast('Your session was revoked.', 'error');
              logout();
              break;
            case 'NOTIFICATION':
            case 'USER_NOTIFICATION':
              if (data.payload?.message) {
                showToast(data.payload.message, 'info');
              }
              break;
            // Add other typed events here
            default:
              break;
          }
        } catch (err) {
          // parse error
        }
      };

      socket.onclose = () => {
        clearInterval(pingInterval.current);
        ws.current = null;

        if (shouldReconnect.current && authState === 'authenticated' && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeout.current = setTimeout(connect, delay);
        }
      };

      socket.onerror = (error) => {
        socket.close(); // let onclose handle reconnect
      };

      ws.current = socket;

    } catch (err) {
      if (shouldReconnect.current && authState === 'authenticated' && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current += 1;
        reconnectTimeout.current = setTimeout(connect, 5000);
      }
    }
  };

  useEffect(() => {
    if (authState === 'authenticated') {
      shouldReconnect.current = true;
      connect();
    } else if (authState === 'unauthenticated') {
      shouldReconnect.current = false;
      if (ws.current) {
        ws.current.close();
      }
      clearTimeout(reconnectTimeout.current);
      clearInterval(pingInterval.current);
    }

    return () => {
      shouldReconnect.current = false;
      if (ws.current) ws.current.close();
      clearTimeout(reconnectTimeout.current);
      clearInterval(pingInterval.current);
    };
  }, [authState]);

  return (
    <WebSocketContext.Provider value={ws.current}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
