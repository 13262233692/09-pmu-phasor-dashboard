export interface Phasor {
  name: string;
  magnitude: number;
  angle: number;
  type: 'voltage' | 'current';
}

export interface PhasorData {
  stationId: string;
  timestamp: number;
  frequency: number;
  freqDeviation: number;
  rocof: number;
  phasors: Phasor[];
  analogs: number[];
  digitals: boolean[];
  dataQuality: number;
  pmuId: number;
}

export interface StationConfig {
  id: string;
  name: string;
  pmuId: number;
  ipAddress: string;
  port: number;
  phasorCount: number;
  analogCount: number;
  digitalCount: number;
  nominalVoltage: number;
  status: 'online' | 'offline' | 'error';
  color: string;
}

export interface AlarmMessage {
  id: string;
  timestamp: number;
  stationId: string;
  type: 'frequency' | 'voltage' | 'angle' | 'communication';
  level: 'info' | 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

export interface WsMessage<T = unknown> {
  type: 'data' | 'alarm' | 'status' | 'config';
  payload: T;
  timestamp: number;
}

export interface SystemStatus {
  totalStations: number;
  onlineStations: number;
  avgFrequency: number;
  maxAngleDiff: number;
  activeAlarms: number;
  uptime: number;
}

export type IslandingSeverity = 'warning' | 'critical' | 'catastrophic';
export type GridMode = 'grid-connected' | 'islanding-transition' | 'islanded';

export interface IslandingEvent {
  id: string;
  timestamp: number;
  detectedAt: number;
  severity: IslandingSeverity;
  gridModeBefore: GridMode;
  gridModeAfter: GridMode;
  title: string;
  description: string;
  affectedStations: string[];
  rootStationId: string;
  preWindowStart: number;
  postWindowEnd: number;
  maxAngleDiff: number;
  maxFreqDeviation: number;
  acknowledged: boolean;
  bookmarks: string[];
}

export interface SimulationBookmark {
  id: string;
  eventId: string;
  timestamp: number;
  title: string;
  color: string;
  note?: string;
  createdAt: number;
  type: 'islanding-start' | 'islanding-peak' | 'islanding-stabilize' | 'custom';
}

export interface SnapshotBatch {
  timestamp: number;
  frames: PhasorData[];
}

export interface ReplaySession {
  eventId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  playbackSpeed: number;
  currentTime: number;
  isPlaying: boolean;
  snapshots: SnapshotBatch[];
  totalSnapshots: number;
}

export interface IslandingDelta {
  timestamp: number;
  stationId: string;
  stationName: string;
  before: {
    frequency: number;
    freqDeviation: number;
    phasors: Array<{
      name: string;
      magnitude: number;
      angle: number;
      type: 'voltage' | 'current';
    }>;
  };
  after: {
    frequency: number;
    freqDeviation: number;
    phasors: Array<{
      name: string;
      magnitude: number;
      angle: number;
      type: 'voltage' | 'current';
    }>;
  };
  delta: {
    frequencyDelta: number;
    freqDeviationDelta: number;
    phasorDeltas: Array<{
      name: string;
      magnitudeDelta: number;
      magnitudeDeltaPercent: number;
      angleDelta: number;
      type: 'voltage' | 'current';
    }>;
  };
}
