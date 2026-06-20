import type { PhasorData, Phasor } from '../../shared/types';
import { EventEmitter } from 'node:events';

const TARGET_INTERVAL_MS = 20;
const BUFFER_MAX_FRAMES = 50;
const MAX_ALIGNMENT_OFFSET_MS = 100;
const STATION_TIMEOUT_MS = 2000;

interface StationBuffer {
  stationId: string;
  frames: PhasorData[];
  lastReceivedAt: number;
  expectedCount: number;
}

interface AlignedBatch {
  timestamp: number;
  frames: Map<string, PhasorData>;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  const diff = b - a;
  const normalized = ((diff + 180) % 360) - 180;
  return a + normalized * t;
}

function lerpPhasor(a: Phasor, b: Phasor, t: number): Phasor {
  return {
    name: a.name,
    magnitude: lerp(a.magnitude, b.magnitude, t),
    angle: lerpAngle(a.angle, b.angle, t),
    type: a.type,
  };
}

export class FrameAligner extends EventEmitter {
  private stationBuffers: Map<string, StationBuffer> = new Map();
  private lastEmittedTimestamp: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(private targetIntervalMs: number = TARGET_INTERVAL_MS) {
    super();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const tick = () => {
      try {
        this.alignAndEmit();
      } catch (err) {
        console.error('[FrameAligner] Error during alignment:', err);
      }
    };

    tick();
    this.timer = setInterval(tick, this.targetIntervalMs);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stationBuffers.clear();
    this.lastEmittedTimestamp = 0;
  }

  addFrame(frame: PhasorData): void {
    if (!frame || !frame.stationId) return;

    const now = Date.now();
    let buffer = this.stationBuffers.get(frame.stationId);

    if (!buffer) {
      buffer = {
        stationId: frame.stationId,
        frames: [],
        lastReceivedAt: now,
        expectedCount: frame.phasors?.length || 0,
      };
      this.stationBuffers.set(frame.stationId, buffer);
    }

    buffer.lastReceivedAt = now;

    if (buffer.frames.length === 0) {
      buffer.frames.push(frame);
      return;
    }

    const lastFrame = buffer.frames[buffer.frames.length - 1];

    if (frame.timestamp <= lastFrame.timestamp) {
      if (Math.abs(frame.timestamp - lastFrame.timestamp) < 2) {
        return;
      }
    }

    buffer.frames.push(frame);

    while (buffer.frames.length > BUFFER_MAX_FRAMES) {
      buffer.frames.shift();
    }
  }

  private interpolateFrame(buffer: StationBuffer, targetTs: number): PhasorData | null {
    const frames = buffer.frames;
    if (frames.length === 0) return null;

    if (frames.length === 1) {
      const single = frames[0];
      if (Math.abs(single.timestamp - targetTs) <= MAX_ALIGNMENT_OFFSET_MS) {
        return { ...single, timestamp: targetTs };
      }
      return null;
    }

    let leftIdx = -1;
    let rightIdx = -1;

    for (let i = 0; i < frames.length - 1; i++) {
      if (frames[i].timestamp <= targetTs && frames[i + 1].timestamp >= targetTs) {
        leftIdx = i;
        rightIdx = i + 1;
        break;
      }
    }

    if (leftIdx === -1) {
      const first = frames[0];
      const last = frames[frames.length - 1];

      if (targetTs < first.timestamp && first.timestamp - targetTs <= MAX_ALIGNMENT_OFFSET_MS) {
        return { ...first, timestamp: targetTs };
      }
      if (targetTs > last.timestamp && targetTs - last.timestamp <= MAX_ALIGNMENT_OFFSET_MS) {
        return { ...last, timestamp: targetTs };
      }
      return null;
    }

    const left = frames[leftIdx];
    const right = frames[rightIdx];
    const span = right.timestamp - left.timestamp;

    if (span <= 0 || span > MAX_ALIGNMENT_OFFSET_MS * 3) {
      const closer = Math.abs(left.timestamp - targetTs) < Math.abs(right.timestamp - targetTs) ? left : right;
      if (Math.abs(closer.timestamp - targetTs) <= MAX_ALIGNMENT_OFFSET_MS) {
        return { ...closer, timestamp: targetTs };
      }
      return null;
    }

    const t = (targetTs - left.timestamp) / span;

    const phasors: Phasor[] = [];
    const maxLen = Math.min(left.phasors.length, right.phasors.length);
    for (let i = 0; i < maxLen; i++) {
      phasors.push(lerpPhasor(left.phasors[i], right.phasors[i], t));
    }

    const analogs: number[] = [];
    const maxAnalog = Math.min(left.analogs.length, right.analogs.length);
    for (let i = 0; i < maxAnalog; i++) {
      analogs.push(lerp(left.analogs[i], right.analogs[i], t));
    }

    return {
      stationId: buffer.stationId,
      timestamp: targetTs,
      frequency: lerp(left.frequency, right.frequency, t),
      freqDeviation: lerp(left.freqDeviation, right.freqDeviation, t),
      rocof: lerp(left.rocof, right.rocof, t),
      phasors,
      analogs,
      digitals: t < 0.5 ? left.digitals : right.digitals,
      dataQuality: t < 0.5 ? left.dataQuality : right.dataQuality,
      pmuId: left.pmuId,
    };
  }

  private getActiveStations(): string[] {
    const now = Date.now();
    const active: string[] = [];
    for (const [stationId, buffer] of this.stationBuffers) {
      if (now - buffer.lastReceivedAt < STATION_TIMEOUT_MS) {
        active.push(stationId);
      }
    }
    return active;
  }

  private alignAndEmit(): void {
    const activeStations = this.getActiveStations();
    if (activeStations.length === 0) return;

    const now = Date.now();
    const alignedTs = Math.floor(now / this.targetIntervalMs) * this.targetIntervalMs;

    if (alignedTs <= this.lastEmittedTimestamp) {
      return;
    }

    const batch: AlignedBatch = {
      timestamp: alignedTs,
      frames: new Map(),
    };

    for (const stationId of activeStations) {
      const buffer = this.stationBuffers.get(stationId);
      if (!buffer) continue;

      const interpolated = this.interpolateFrame(buffer, alignedTs);
      if (interpolated) {
        batch.frames.set(stationId, interpolated);
      }
    }

    if (batch.frames.size > 0) {
      this.lastEmittedTimestamp = alignedTs;
      this.emit('aligned', {
        timestamp: alignedTs,
        frames: Array.from(batch.frames.values()),
      });
    }
  }

  getStationLastTimestamp(stationId: string): number {
    const buffer = this.stationBuffers.get(stationId);
    if (!buffer || buffer.frames.length === 0) return 0;
    return buffer.frames[buffer.frames.length - 1].timestamp;
  }

  getActiveStationCount(): number {
    return this.getActiveStations().length;
  }
}

export const frameAligner = new FrameAligner();
