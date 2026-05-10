import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
  const listenersRef = useRef({});
  const [lastEvent, setLastEvent] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [liveFeed, setLiveFeed] = useState([]); // List of recent bot activities
  const [recommendedJobs, setRecommendedJobs] = useState([]); // List of high-match external jobsc event types

  // Subscribe to specific event types
  const subscribe = useCallback((eventType, callback) => {
    if (!listenersRef.current[eventType]) {
      listenersRef.current[eventType] = [];
    }
    listenersRef.current[eventType].push(callback);

    // Return unsubscribe function
    return () => {
      listenersRef.current[eventType] = listenersRef.current[eventType].filter(
        (cb) => cb !== callback
      );
    };
  }, []);

  const sendMessage = useCallback((type, payload) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

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
        setIsConnected(true);

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
          const eventType = data.type;

          // Update last event state
          setLastEvent(data);

          switch (eventType) {
            case 'PONG':
              // Heartbeat acknowledged
              break;
            case 'FORCE_REAUTH':
            case 'SESSION_REVOKED':
              shouldReconnect.current = false;
              socket.close();
              showToast('Your session was revoked.', 'error');
              logout();
              break;

            // ── Real-time Job Events ────────────────────────────────
            case 'JOB_APPLIED': {
              const p = data.payload || {};
              const scoreText = p.match_score != null ? ` (${p.match_score}% match)` : '';
              showToast(`✅ Applied: ${p.job_title} at ${p.company}${scoreText}`, 'success');
              setLiveFeed(prev => [{...p, type: 'applied', receivedAt: Date.now()}, ...prev].slice(0, 50));
              break;
            }
            case 'JOB_RECOMMENDED': {
              const p = data.payload || {};
              showToast(`🎯 High Match Found: ${p.job_title} at ${p.company} (${p.match_score}%)`, 'success');
              setRecommendedJobs(prev => [{...p, receivedAt: Date.now()}, ...prev].slice(0, 20));
              break;
            }
            case 'JOB_FAILED': {
              const p = data.payload || {};
              setLiveFeed(prev => [{...p, type: 'failed', receivedAt: Date.now()}, ...prev].slice(0, 50));
              break;
            }
            case 'JOB_SKIPPED': {
              const p = data.payload || {};
              setLiveFeed(prev => [{...p, type: 'skipped', receivedAt: Date.now()}, ...prev].slice(0, 50));
              break;
            }

            // ── Skill Gap Alert ─────────────────────────────────────
            case 'SKILL_GAP_ALERT': {
              const p = data.payload || {};
              const skills = (p.missing_skills || []).slice(0, 3).join(', ');
              showToast(`📊 Skill gap detected for ${p.job_title}: ${skills}`, 'info');
              break;
            }

            // ── Bot Run Summary ─────────────────────────────────────
            case 'BOT_RUN_SUMMARY': {
              const p = data.payload || {};
              showToast(`🏁 Bot run complete: ${p.applied || 0} applied, ${p.failed || 0} failed`, 'success');
              break;
            }

            case 'NOTIFICATION':
            case 'USER_NOTIFICATION':
              if (data.payload?.message) {
                showToast(data.payload.message, 'info');
              }
              break;

            default:
              break;
          }

          // Notify registered listeners
          if (listenersRef.current[eventType]) {
            listenersRef.current[eventType].forEach((cb) => {
              try { cb(data); } catch (e) { /* listener error */ }
            });
          }
          // Also notify wildcard listeners
          if (listenersRef.current['*']) {
            listenersRef.current['*'].forEach((cb) => {
              try { cb(data); } catch (e) { /* listener error */ }
            });
          }

        } catch (err) {
          // parse error
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
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
      setLiveFeed([]);
      setRecommendedJobs([]);
    }

    return () => {
      shouldReconnect.current = false;
      if (ws.current) ws.current.close();
      clearTimeout(reconnectTimeout.current);
      clearInterval(pingInterval.current);
    };
  }, [authState]);

  return (
    <WebSocketContext.Provider value={{ isConnected, sendMessage, liveFeed, recommendedJobs, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
