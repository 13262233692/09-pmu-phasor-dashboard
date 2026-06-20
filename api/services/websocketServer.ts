import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import type { IncomingMessage } from 'http';
import type { PhasorData, WsMessage, AlarmMessage, SystemStatus } from '../../shared/types';
import { config, DEFAULT_STATIONS } from '../config/default';
import { alarmEngine } from './alarmEngine';
import { redisClient } from './redisClient';

export class WsServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private startTime: number = Date.now();

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server, path: '/ws/realtime' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      console.log('[WS] Client connected:', req.socket.remoteAddress);
      this.clients.add(ws);

      this.sendInitialState(ws);

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('[WS] Client error:', err.message);
        this.clients.delete(ws);
      });
    });

    this.wss.on('error', (err) => {
      console.error('[WS] Server error:', err.message);
    });

    this.setupAlarmListeners();
  }

  private setupAlarmListeners(): void {
    alarmEngine.on('alarm', (alarm: AlarmMessage) => {
      this.broadcast<AlarmMessage>({
        type: 'alarm',
        payload: alarm,
        timestamp: Date.now(),
      });
    });

    alarmEngine.on('alarm-cleared', (alarmId: string) => {
      this.broadcast({
        type: 'status',
        payload: { alarmCleared: alarmId },
        timestamp: Date.now(),
      });
    });
  }

  private async sendInitialState(ws: WebSocket): Promise<void> {
    try {
      this.send(ws, {
        type: 'config',
        payload: DEFAULT_STATIONS,
        timestamp: Date.now(),
      });

      const historyData = await redisClient.readLatest(500);
      if (historyData.length > 0) {
        this.send(ws, {
          type: 'data',
          payload: historyData,
          timestamp: Date.now(),
        });
      }

      const alarms = alarmEngine.getActiveAlarms();
      if (alarms.length > 0) {
        this.send(ws, {
          type: 'alarm',
          payload: alarms,
          timestamp: Date.now(),
        });
      }

      this.sendSystemStatus(ws);
    } catch (err) {
      console.error('[WS] Failed to send initial state:', err);
    }
  }

  broadcastData(data: PhasorData | PhasorData[]): void {
    const payload = Array.isArray(data) ? data : [data];
    this.broadcast<PhasorData[]>({
      type: 'data',
      payload,
      timestamp: Date.now(),
    });
  }

  private broadcast<T>(message: WsMessage<T>): void {
    const json = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json, { binary: false });
      }
    });
  }

  private send<T>(ws: WebSocket, message: WsMessage<T>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message), { binary: false });
    }
  }

  private async sendSystemStatus(ws: WebSocket): Promise<void> {
    try {
      const onlineStations = await redisClient.getOnlineStations();
      const latestData = await Promise.all(
        DEFAULT_STATIONS.map((s) => redisClient.getLatestData(s.name))
      );
      const validData = latestData.filter((d): d is PhasorData => d !== null);

      const avgFrequency = validData.length > 0
        ? validData.reduce((sum, d) => sum + d.frequency, 0) / validData.length
        : 50;

      const angles = validData
        .map((d) => d.phasors.find((p) => p.type === 'voltage')?.angle || 0)
        .filter((a) => a !== undefined);

      let maxAngleDiff = 0;
      if (angles.length > 1) {
        const sumSin = angles.reduce((s, a) => s + Math.sin((a * Math.PI) / 180), 0);
        const sumCos = angles.reduce((s, a) => s + Math.cos((a * Math.PI) / 180), 0);
        const avgAngle = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
        maxAngleDiff = Math.max(...angles.map((a) => {
          let diff = Math.abs(a - avgAngle);
          return diff > 180 ? 360 - diff : diff;
        }));
      }

      const status: SystemStatus = {
        totalStations: DEFAULT_STATIONS.length,
        onlineStations: onlineStations.length,
        avgFrequency,
        maxAngleDiff,
        activeAlarms: alarmEngine.getActiveAlarms().length,
        uptime: Date.now() - this.startTime,
      };

      this.send(ws, {
        type: 'status',
        payload: status,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[WS] Failed to send system status:', err);
    }
  }

  startStatusBroadcast(): void {
    setInterval(async () => {
      const onlineStations = await redisClient.getOnlineStations();
      const latestData = await Promise.all(
        DEFAULT_STATIONS.map((s) => redisClient.getLatestData(s.name))
      );
      const validData = latestData.filter((d): d is PhasorData => d !== null);

      const avgFrequency = validData.length > 0
        ? validData.reduce((sum, d) => sum + d.frequency, 0) / validData.length
        : 50;

      const angles = validData
        .map((d) => d.phasors.find((p) => p.type === 'voltage')?.angle || 0)
        .filter((a) => a !== undefined);

      let maxAngleDiff = 0;
      if (angles.length > 1) {
        const sumSin = angles.reduce((s, a) => s + Math.sin((a * Math.PI) / 180), 0);
        const sumCos = angles.reduce((s, a) => s + Math.cos((a * Math.PI) / 180), 0);
        const avgAngle = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
        maxAngleDiff = Math.max(...angles.map((a) => {
          let diff = Math.abs(a - avgAngle);
          return diff > 180 ? 360 - diff : diff;
        }));
      }

      const status: SystemStatus = {
        totalStations: DEFAULT_STATIONS.length,
        onlineStations: onlineStations.length,
        avgFrequency,
        maxAngleDiff,
        activeAlarms: alarmEngine.getActiveAlarms().length,
        uptime: Date.now() - this.startTime,
      };

      this.broadcast<SystemStatus>({
        type: 'status',
        payload: status,
        timestamp: Date.now(),
      });
    }, 1000);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    this.wss.close();
  }
}

export let wsServer: WsServer | null = null;

export const initWsServer = (server: http.Server): WsServer => {
  wsServer = new WsServer(server);
  return wsServer;
};
