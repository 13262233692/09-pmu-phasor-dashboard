import 'dotenv/config';
import { createServer } from 'http';
import { app } from './app';
import { initWsServer, wsServer } from './services/websocketServer';
import { redisClient } from './services/redisClient';
import { alarmEngine } from './services/alarmEngine';
import { pmuBridge } from './services/pmuBridge';
import { dataSimulator } from './services/simulator';
import { frameAligner } from './services/frameAligner';
import { validateAndCorrectPhasorData, registerStationNominal } from './services/dataValidator';
import { islandingDetector } from './services/islandingDetector';
import { sandboxEngine } from './services/sandboxEngine';
import { config } from './config/default';
import type { PhasorData, StationConfig, IslandingEvent } from '../shared/types';

const server = createServer(app);
initWsServer(server);

const stationConfigs: Map<string, StationConfig> = new Map();

const handleValidatedData = async (data: PhasorData) => {
  try {
    frameAligner.addFrame(data);
  } catch (err) {
    console.error('[Data] Frame aligner error:', err);
  }
};

const handleRawData = async (data: PhasorData) => {
  try {
    const stationConfig = stationConfigs.get(data.stationId);
    const validation = validateAndCorrectPhasorData(data, stationConfig);

    if (!validation.valid) {
      console.warn(
        `[Data] Dropped invalid frame from ${data.stationId}:`,
        validation.errors.join('; ')
      );
      return;
    }

    if (validation.warnings.length > 0) {
      console.warn(
        `[Data] Corrections for ${data.stationId}:`,
        validation.warnings.join('; ')
      );
    }

    const processed = validation.corrected || data;
    await handleValidatedData(processed);
  } catch (err) {
    console.error('[Data] Raw processing error:', err);
  }
};

islandingDetector.on('islanding-event', (event: IslandingEvent) => {
  sandboxEngine.registerEvent(event);
  console.log(
    `[Islanding] Event ${event.id} registered. Severity=${event.severity}. ` +
    `Pre/Post window = ${(event.timestamp - event.preWindowStart) / 1000}s / ` +
    `${(event.postWindowEnd - event.timestamp) / 1000}s`
  );

  if (wsServer) {
    wsServer.sendRaw({
      type: 'alarm',
      payload: {
        id: `islanding:${event.id}`,
        timestamp: event.timestamp,
        stationId: event.rootStationId,
        type: 'angle',
        level: event.severity === 'warning' ? 'warning' : 'critical',
        message: event.title + ' - ' + event.description,
        value: event.maxAngleDiff,
        threshold: 15,
      },
      timestamp: Date.now(),
    });

    wsServer.sendRaw({
      type: 'status',
      payload: { islandingEvent: event } as any,
      timestamp: Date.now(),
    });
  }
});

frameAligner.on('aligned', async (batch: { timestamp: number; frames: PhasorData[] }) => {
  try {
    for (const data of batch.frames) {
      await redisClient.addPhasorData(data);
      await redisClient.setOnlineStation(data.stationId);
      alarmEngine.updateData(data);
      islandingDetector.ingest(data);
      sandboxEngine.ingestFrame(data);
    }

    if (wsServer) {
      wsServer.broadcastData(batch.frames);
    }
  } catch (err) {
    console.error('[Data] Aligned batch processing error:', err);
  }
});

const startServices = async () => {
  try {
    await redisClient.waitForReady();

    console.log(`[Redis] Using ${redisClient.isUsingMemory() ? 'MEMORY' : 'REDIS'} storage mode`);

    const stations: StationConfig[] = [
      {
        id: 'STATION_A',
        name: '变电站A',
        pmuId: 1,
        ipAddress: '192.168.1.101',
        port: 4712,
        phasorCount: 6,
        analogCount: 0,
        digitalCount: 0,
        nominalVoltage: 220,
        status: 'online',
        color: '#00f0ff',
      },
      {
        id: 'STATION_B',
        name: '变电站B',
        pmuId: 2,
        ipAddress: '192.168.1.102',
        port: 4712,
        phasorCount: 6,
        analogCount: 0,
        digitalCount: 0,
        nominalVoltage: 500,
        status: 'online',
        color: '#ff6b35',
      },
      {
        id: 'STATION_C',
        name: '变电站C',
        pmuId: 3,
        ipAddress: '192.168.1.103',
        port: 4712,
        phasorCount: 6,
        analogCount: 0,
        digitalCount: 0,
        nominalVoltage: 220,
        status: 'online',
        color: '#00ff88',
      },
      {
        id: 'STATION_D',
        name: '变电站D',
        pmuId: 4,
        ipAddress: '192.168.1.104',
        port: 4712,
        phasorCount: 6,
        analogCount: 0,
        digitalCount: 0,
        nominalVoltage: 330,
        status: 'online',
        color: '#ff4466',
      },
      {
        id: 'STATION_E',
        name: '变电站E',
        pmuId: 5,
        ipAddress: '192.168.1.105',
        port: 4712,
        phasorCount: 6,
        analogCount: 0,
        digitalCount: 0,
        nominalVoltage: 110,
        status: 'online',
        color: '#ffdd00',
      },
    ];

    for (const station of stations) {
      stationConfigs.set(station.id, station);
      registerStationNominal(station.id, station.nominalVoltage);
      await redisClient.saveStationConfig(station);
    }

    frameAligner.start();
    console.log('[FrameAligner] Started with 20ms alignment interval');

    pmuBridge.start();
    pmuBridge.onData(handleRawData);

    if (config.simulation.enabled) {
      dataSimulator.onData(handleRawData);
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
║  Frame Alignment : 20ms (50Hz)                              ║
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
  frameAligner.stop();
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
