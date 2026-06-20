import { useEffect, useRef, useCallback } from 'react';
import type { WsMessage, PhasorData, StationConfig, AlarmMessage, SystemStatus } from '../../shared/types';
import { useDataStore } from '../store/useDataStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws/realtime';

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);

  const {
    setStations,
    addPhasorData,
    addAlarm,
    clearAlarm,
    setSystemStatus,
    setConnected,
  } = useDataStore();

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current) return;
    if (reconnectTimerRef.current) return;

    reconnectTimerRef.current = setTimeout(() => {
      console.log('[WS] Reconnecting...');
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[WS] Connected to server');
          setConnected(true);
          shouldReconnectRef.current = true;

          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const message: WsMessage = JSON.parse(event.data);
            
            switch (message.type) {
              case 'config':
                setStations(message.payload as StationConfig[]);
                break;
              case 'data':
                addPhasorData(message.payload as PhasorData | PhasorData[]);
                break;
              case 'alarm': {
                const payload = message.payload;
                if (Array.isArray(payload)) {
                  payload.forEach((a) => addAlarm(a));
                } else {
                  addAlarm(payload as AlarmMessage);
                }
                break;
              }
              case 'status': {
                const statusPayload = message.payload as Record<string, unknown>;
                if (statusPayload.alarmCleared) {
                  clearAlarm(statusPayload.alarmCleared as string);
                } else {
                  setSystemStatus(statusPayload as unknown as SystemStatus);
                }
                break;
              }
            }
          } catch (err) {
            console.error('[WS] Failed to parse message:', err);
          }
        };

        ws.onclose = () => {
          console.log('[WS] Disconnected');
          setConnected(false);
          scheduleReconnect();
        };

        ws.onerror = (err) => {
          console.error('[WS] Error:', err);
        };
      } catch (err) {
        console.error('[WS] Failed to connect:', err);
        scheduleReconnect();
      }
    }, 3000);
  }, [setStations, addPhasorData, addAlarm, clearAlarm, setSystemStatus, setConnected]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to server');
        setConnected(true);
        shouldReconnectRef.current = true;

        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'config':
              setStations(message.payload as StationConfig[]);
              break;
            case 'data':
              addPhasorData(message.payload as PhasorData | PhasorData[]);
              break;
            case 'alarm': {
              const payload = message.payload;
              if (Array.isArray(payload)) {
                payload.forEach((a) => addAlarm(a));
              } else {
                addAlarm(payload as AlarmMessage);
              }
              break;
            }
            case 'status': {
              const statusPayload = message.payload as Record<string, unknown>;
              if (statusPayload.alarmCleared) {
                clearAlarm(statusPayload.alarmCleared as string);
              } else {
                setSystemStatus(statusPayload as SystemStatus);
              }
              break;
            }
          }
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    } catch (err) {
      console.error('[WS] Failed to connect:', err);
      scheduleReconnect();
    }
  }, [setStations, addPhasorData, addAlarm, clearAlarm, setSystemStatus, setConnected, scheduleReconnect]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connect,
    disconnect,
    isConnected: () => wsRef.current?.readyState === WebSocket.OPEN,
  };
};
