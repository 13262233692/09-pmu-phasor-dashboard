import { EventEmitter } from 'node:events';
import type { PhasorData, IslandingEvent, IslandingSeverity, GridMode } from '../../shared/types';

const ANGLE_TEAR_THRESHOLD = 15;
const CRITICAL_ANGLE_THRESHOLD = 30;
const FREQ_SPLIT_THRESHOLD = 0.3;
const CRITICAL_FREQ_THRESHOLD = 1.0;
const PRE_EVENT_WINDOW_MS = 10000;
const POST_EVENT_WINDOW_MS = 30000;
const COOLDOWN_MS = 60000;
const HISTORY_WINDOW_MS = 30000;

function uid(): string {
  return 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

interface StationHistoryEntry {
  timestamp: number;
  angle: number;
  frequency: number;
}

export class IslandingDetector extends EventEmitter {
  private stationHistory: Map<string, StationHistoryEntry[]> = new Map();
  private lastEventAt: number = 0;
  private currentMode: GridMode = 'grid-connected';
  private currentEvent: IslandingEvent | null = null;

  constructor() {
    super();
  }

  ingest(data: PhasorData): void {
    const voltagePhasor = data.phasors.find((p) => p.type === 'voltage');
    if (!voltagePhasor) return;

    const entry: StationHistoryEntry = {
      timestamp: data.timestamp,
      angle: voltagePhasor.angle,
      frequency: data.frequency,
    };

    let history = this.stationHistory.get(data.stationId);
    if (!history) {
      history = [];
      this.stationHistory.set(data.stationId, history);
    }
    history.push(entry);

    const cutoff = data.timestamp - HISTORY_WINDOW_MS;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }

    this.checkIslanding();
  }

  private checkIslanding(): void {
    const stations = Array.from(this.stationHistory.keys());
    if (stations.length < 2) return;

    const latestData: Map<string, StationHistoryEntry> = new Map();
    for (const stationId of stations) {
      const hist = this.stationHistory.get(stationId);
      if (hist && hist.length > 0) {
        latestData.set(stationId, hist[hist.length - 1]);
      }
    }

    if (latestData.size < 2) return;

    const entries = Array.from(latestData.entries());
    const refAngle = entries[0][1].angle;

    let maxAngleDiff = 0;
    let maxFreqDiff = 0;
    let outlierStation = '';
    const affected: string[] = [];

    for (let i = 1; i < entries.length; i++) {
      const [stationId, d] = entries[i];
      let diff = Math.abs(d.angle - refAngle);
      if (diff > 180) diff = 360 - diff;
      maxAngleDiff = Math.max(maxAngleDiff, diff);

      const freqDiff = Math.abs(d.frequency - entries[0][1].frequency);
      maxFreqDiff = Math.max(maxFreqDiff, freqDiff);

      if (diff > ANGLE_TEAR_THRESHOLD || freqDiff > FREQ_SPLIT_THRESHOLD) {
        affected.push(stationId);
        if (diff > maxAngleDiff * 0.8) {
          outlierStation = stationId;
        }
      }
    }

    const detected =
      maxAngleDiff > ANGLE_TEAR_THRESHOLD || maxFreqDiff > FREQ_SPLIT_THRESHOLD;
    const now = Date.now();

    if (detected && now - this.lastEventAt > COOLDOWN_MS) {
      const newMode: GridMode =
        maxAngleDiff > CRITICAL_ANGLE_THRESHOLD || maxFreqDiff > CRITICAL_FREQ_THRESHOLD
          ? 'islanded'
          : 'islanding-transition';

      const severity: IslandingSeverity =
        newMode === 'islanded'
          ? maxAngleDiff > CRITICAL_ANGLE_THRESHOLD + 15 || maxFreqDiff > 2.0
            ? 'catastrophic'
            : 'critical'
          : 'warning';

      const timestamp = entries[0][1].timestamp;

      const event: IslandingEvent = {
        id: uid(),
        timestamp,
        detectedAt: now,
        severity,
        gridModeBefore: this.currentMode,
        gridModeAfter: newMode,
        title:
          newMode === 'islanded'
            ? '电网解列：孤岛运行告警'
            : '相角撕裂：孤岛趋势预警',
        description:
          newMode === 'islanded'
            ? `检测到电网发生解列，${affected.length}个站点进入孤岛运行。最大相角差 ${maxAngleDiff.toFixed(2)}°，最大频率差 ${maxFreqDiff.toFixed(4)}Hz`
            : `检测到站点相角/频率偏离增大，疑似孤岛形成趋势。最大相角差 ${maxAngleDiff.toFixed(2)}°，最大频率差 ${maxFreqDiff.toFixed(4)}Hz`,
        affectedStations: affected.length > 0 ? affected : stations,
        rootStationId: outlierStation || entries[0][0],
        preWindowStart: timestamp - PRE_EVENT_WINDOW_MS,
        postWindowEnd: timestamp + POST_EVENT_WINDOW_MS,
        maxAngleDiff,
        maxFreqDeviation: maxFreqDiff,
        acknowledged: false,
        bookmarks: [],
      };

      this.lastEventAt = now;
      this.currentMode = newMode;
      this.currentEvent = event;

      this.emit('islanding-event', event);
      console.log(
        `[Islanding] Detected ${severity} event at ${new Date(timestamp).toISOString()}: maxAngle=${maxAngleDiff.toFixed(1)}° maxFreqDelta=${maxFreqDiff.toFixed(4)}Hz`
      );
    }

    if (!detected && this.currentMode !== 'grid-connected') {
      const stableCheck = entries.every(([, d]) => {
        let diff = Math.abs(d.angle - entries[0][1].angle);
        if (diff > 180) diff = 360 - diff;
        const freqDiff = Math.abs(d.frequency - entries[0][1].frequency);
        return diff < ANGLE_TEAR_THRESHOLD / 2 && freqDiff < FREQ_SPLIT_THRESHOLD / 2;
      });

      if (stableCheck && now - this.lastEventAt > COOLDOWN_MS / 2) {
        this.currentMode = 'grid-connected';
        console.log('[Islanding] Grid restored to connected mode');
      }
    }
  }

  getCurrentMode(): GridMode {
    return this.currentMode;
  }

  getLastEvent(): IslandingEvent | null {
    return this.currentEvent;
  }
}

export const islandingDetector = new IslandingDetector();
