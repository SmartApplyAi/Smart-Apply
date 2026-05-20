import { useContext } from 'react';
import { WebSocketContext } from '../websocket/WebSocketProvider';

export function useWebSocket() {
  return useContext(WebSocketContext);
}
