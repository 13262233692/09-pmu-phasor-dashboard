import 'dotenv/config';
import { createServer } from 'http';
import { app } from './app';
import { initWsServer, wsServer } from './services/websocketServer';
import { redisClient } from './services/redisClient';
import { alarmEngine } from './services/alarmEngine';
import { pmuBridge } from './services/pmuBridge';
import { dataSimulator } from './services/simulator';
import { config } from './config/default';
import type { PhasorData } from '../shared/types';

const server = createServer(app);
initWsServer(server);

const handleData = async (data: PhasorData) => {
  try {
    await redisClient.addPhasorData(data);
    await redisClient.setOnlineStation(data.stationId);
    alarmEngine.updateData(data);

    if (wsServer) {
      wsServer.broadcastData(data);
    }
  } catch (err) {
    console.error('[Data] Processing error:', err);
  }
};

const startServices = async () => {
  try {
    await redisClient.waitForReady();
    
    console.log(`[Redis] Using ${redisClient.isUsingMemory() ? 'MEMORY' : 'REDIS'} storage mode`);

    await redisClient.saveStationConfig({
      id: 'station-1',
      name: 'STATION_A',
      pmuId: 1,
      ipAddress: '192.168.1.101',
      port: 4712,
      phasorCount: 6,
      analogCount: 0,
      digitalCount: 0,
      nominalVoltage: 220,
      status: 'online',
      color: '#00f0ff',
    });

    pmuBridge.start();
    pmuBridge.onData(handleData);

    if (config.simulation.enabled) {
      dataSimulator.onData(handleData);
      dataSimulator.start();
    }

    alarmEngine.start();

    if (wsServer) {
      wsServer.startStatusBroadcast();
    }

    const port = config.server.port;
    server.listen(port, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║  WAMS - Wide Area Measurement System Control Center         ║
╠══════════════════════════════════════════════════════════════╣
║  Server Port     : ${port.toString().padEnd(47)}║
║  WebSocket Path  : /ws/realtime                             ║
║  Native Addon    : ${(pmuBridge.hasNativeAddon() ? 'ENABLED' : 'DISABLED').padEnd(47)}║
║  Simulation      : ${(config.simulation.enabled ? 'ENABLED (' + config.simulation.frameRate + 'fps)' : 'DISABLED').padEnd(47)}║
║  UDP Multicast   : ${config.udp.multicastAddress + ':' + config.udp.port.toString().padEnd(38)}║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('[Startup] Failed to start services:', err);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Gracefully shutting down...');
  pmuBridge.stop();
  dataSimulator.stop();
  alarmEngine.stop();
  if (wsServer) {
    wsServer.close();
  }
  await redisClient.disconnect();
  server.close(() => {
    console.log('[Shutdown] Server closed');
    process.exit(0);
  });
});

startServices();
