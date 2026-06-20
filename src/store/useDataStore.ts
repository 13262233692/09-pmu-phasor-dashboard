import { create } from 'zustand';
import type { PhasorData, StationConfig, AlarmMessage, SystemStatus } from '../../shared/types';

interface DataState {
  stations: StationConfig[];
  latestData: Map<string, PhasorData>;
  phasorHistory: Map<string, PhasorData[]>;
  frequencyHistory: Map<string, { timestamp: number; value: number }[]>;
  alarms: AlarmMessage[];
  systemStatus: SystemStatus;
  selectedStation: string | null;
  connected: boolean;
  lastUpdateTime: number;
  frameCount: number;
  fps: number;
  
  setStations: (stations: StationConfig[]) => void;
  addPhasorData: (data: PhasorData | PhasorData[]) => void;
  addAlarm: (alarm: AlarmMessage) => void;
  clearAlarm: (alarmId: string) => void;
  setSystemStatus: (status: SystemStatus) => void;
  setSelectedStation: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
  getStationColor: (stationId: string) => string;
  getStationLatest: (stationId: string) => PhasorData | undefined;
}

const MAX_HISTORY_LENGTH = 500;
const MAX_FREQ_HISTORY_LENGTH = 1000;

export const useDataStore = create<DataState>((set, get) => ({
  stations: [],
  latestData: new Map(),
  phasorHistory: new Map(),
  frequencyHistory: new Map(),
  alarms: [],
  systemStatus: {
    totalStations: 0,
    onlineStations: 0,
    avgFrequency: 50,
    maxAngleDiff: 0,
    activeAlarms: 0,
    uptime: 0,
  },
  selectedStation: null,
  connected: false,
  lastUpdateTime: 0,
  frameCount: 0,
  fps: 0,

  setStations: (stations) => set({ stations }),

  addPhasorData: (data) => {
    const dataArray = Array.isArray(data) ? data : [data];
    
    set((state) => {
      const newLatest = new Map(state.latestData);
      const newPhasorHistory = new Map(state.phasorHistory);
      const newFreqHistory = new Map(state.frequencyHistory);

      for (const d of dataArray) {
        newLatest.set(d.stationId, d);

        const phasorHistory = newPhasorHistory.get(d.stationId) || [];
        phasorHistory.push(d);
        if (phasorHistory.length > MAX_HISTORY_LENGTH) {
          phasorHistory.shift();
        }
        newPhasorHistory.set(d.stationId, phasorHistory);

        const freqHistory = newFreqHistory.get(d.stationId) || [];
        freqHistory.push({
          timestamp: d.timestamp,
          value: d.frequency,
        });
        if (freqHistory.length > MAX_FREQ_HISTORY_LENGTH) {
          freqHistory.shift();
        }
        newFreqHistory.set(d.stationId, freqHistory);
      }

      const now = Date.now();
      const elapsed = now - state.lastUpdateTime;
      let newFrameCount = state.frameCount + dataArray.length;
      let newFps = state.fps;

      if (elapsed >= 1000) {
        newFps = Math.round((newFrameCount * 1000) / elapsed);
        newFrameCount = 0;
      }

      return {
        latestData: newLatest,
        phasorHistory: newPhasorHistory,
        frequencyHistory: newFreqHistory,
        lastUpdateTime: elapsed >= 1000 ? now : state.lastUpdateTime,
        frameCount: newFrameCount,
        fps: newFps,
      };
    });
  },

  addAlarm: (alarm) =>
    set((state) => {
      const existing = state.alarms.find((a) => a.id === alarm.id);
      if (existing) {
        return {
          alarms: state.alarms.map((a) =>
            a.id === alarm.id ? alarm : a
          ),
        };
      }
      return { alarms: [alarm, ...state.alarms].slice(0, 50) };
    }),

  clearAlarm: (alarmId) =>
    set((state) => ({
      alarms: state.alarms.filter((a) => a.id !== alarmId),
    })),

  setSystemStatus: (systemStatus) => set({ systemStatus }),

  setSelectedStation: (selectedStation) => set({ selectedStation }),

  setConnected: (connected) => set({ connected }),

  getStationColor: (stationId) => {
    const station = get().stations.find((s) => s.name === stationId || s.id === stationId);
    return station?.color || '#00f0ff';
  },

  getStationLatest: (stationId) => {
    return get().latestData.get(stationId);
  },
}));
