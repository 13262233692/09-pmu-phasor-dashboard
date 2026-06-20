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
