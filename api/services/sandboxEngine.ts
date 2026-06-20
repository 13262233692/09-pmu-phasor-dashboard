import type {
  PhasorData,
  IslandingEvent,
  SimulationBookmark,
  SnapshotBatch,
  IslandingDelta,
} from '../../shared/types';
import { redisClient } from './redisClient';

interface PersistedEvent {
  event: IslandingEvent;
  timeline: Map<number, Map<string, PhasorData>>;
  bookmarks: Map<string, SimulationBookmark>;
}

function uid(): string {
  return 'bm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function roundTs(ts: number, interval: number): number {
  return Math.round(ts / interval) * interval;
}

class SandboxEngine {
  private events: Map<string, PersistedEvent> = new Map();
  private preEventBuffer: Map<string, PhasorData[]> = new Map();
  private preEventMaxLen: number = 500;
  private activeSamplingFor: Set<string> = new Set();
  private samplingEndAt: Map<string, number> = new Map();
  private samplingInterval: number = 10;

  constructor() {}

  ingestFrame(data: PhasorData): void {
    let buf = this.preEventBuffer.get(data.stationId);
    if (!buf) {
      buf = [];
      this.preEventBuffer.set(data.stationId, buf);
    }
    buf.push(data);
    if (buf.length > this.preEventMaxLen) buf.shift();

    for (const eventId of Array.from(this.activeSamplingFor)) {
      const endTs = this.samplingEndAt.get(eventId);
      if (endTs && data.timestamp > endTs) {
        this.activeSamplingFor.delete(eventId);
        this.samplingEndAt.delete(eventId);
        continue;
      }
      this.appendFrameToEvent(eventId, data);
    }
  }

  registerEvent(event: IslandingEvent): void {
    if (this.events.has(event.id)) return;

    const timeline = new Map<number, Map<string, PhasorData>>();
    const bookmarks = new Map<string, SimulationBookmark>();

    for (const [stationId, frames] of this.preEventBuffer.entries()) {
      for (const frame of frames) {
        if (frame.timestamp >= event.preWindowStart) {
          this.insertIntoTimeline(timeline, frame);
        }
      }
    }

    this.events.set(event.id, { event, timeline, bookmarks });

    this.activeSamplingFor.add(event.id);
    this.samplingEndAt.set(event.id, event.postWindowEnd);

    this.autoBookmark(event);

    console.log(
      `[Sandbox] Registered event ${event.id}, pre-loaded ${timeline.size} time slots`
    );
  }

  private insertIntoTimeline(
    timeline: Map<number, Map<string, PhasorData>>,
    frame: PhasorData
  ): void {
    const key = roundTs(frame.timestamp, this.samplingInterval);
    let bucket = timeline.get(key);
    if (!bucket) {
      bucket = new Map();
      timeline.set(key, bucket);
    }
    bucket.set(frame.stationId, frame);
  }

  private appendFrameToEvent(eventId: string, frame: PhasorData): void {
    const persisted = this.events.get(eventId);
    if (!persisted) return;
    if (
      frame.timestamp < persisted.event.preWindowStart ||
      frame.timestamp > persisted.event.postWindowEnd
    )
      return;
    this.insertIntoTimeline(persisted.timeline, frame);
  }

  private autoBookmark(event: IslandingEvent): void {
    const persisted = this.events.get(event.id);
    if (!persisted) return;

    const bm1: SimulationBookmark = {
      id: uid(),
      eventId: event.id,
      timestamp: event.timestamp,
      title: '解列瞬间 (T+0)',
      color: '#ff4466',
      createdAt: Date.now(),
      type: 'islanding-start',
      note: '电网解列检测时刻，相角/频率开始快速偏离',
    };

    const bm2: SimulationBookmark = {
      id: uid(),
      eventId: event.id,
      timestamp: event.timestamp - 5000,
      title: '解列前5秒',
      color: '#00f0ff',
      createdAt: Date.now(),
      type: 'custom',
      note: '解列前的稳态参考时刻',
    };

    const bm3: SimulationBookmark = {
      id: uid(),
      eventId: event.id,
      timestamp: event.timestamp + 10000,
      title: '解列后10秒',
      color: '#00ff88',
      createdAt: Date.now(),
      type: 'islanding-stabilize',
      note: '孤岛运行进入稳定状态时刻',
    };

    persisted.bookmarks.set(bm1.id, bm1);
    persisted.bookmarks.set(bm2.id, bm2);
    persisted.bookmarks.set(bm3.id, bm3);

    persisted.event.bookmarks = [bm1.id, bm2.id, bm3.id];
  }

  listEvents(): IslandingEvent[] {
    return Array.from(this.events.values())
      .map((p) => p.event)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getEvent(eventId: string): IslandingEvent | null {
    return this.events.get(eventId)?.event || null;
  }

  getEventTimeline(
    eventId: string,
    startTs?: number,
    endTs?: number,
    sampleIntervalMs: number = 20
  ): SnapshotBatch[] {
    const persisted = this.events.get(eventId);
    if (!persisted) return [];

    const e = persisted.event;
    const from = startTs ?? e.preWindowStart;
    const to = endTs ?? e.postWindowEnd;

    const result: SnapshotBatch[] = [];
    let cursor = roundTs(from, sampleIntervalMs);
    const stop = roundTs(to, sampleIntervalMs);

    while (cursor <= stop) {
      let found = 0;
      let nearestKey = -1;
      let nearestDist = Infinity;

      for (const key of persisted.timeline.keys()) {
        const dist = Math.abs(key - cursor);
        if (dist < nearestDist && dist <= Math.max(sampleIntervalMs, 50)) {
          nearestDist = dist;
          nearestKey = key;
        }
      }

      if (nearestKey >= 0) {
        const bucket = persisted.timeline.get(nearestKey)!;
        result.push({
          timestamp: cursor,
          frames: Array.from(bucket.values()),
        });
        found = bucket.size;
      } else {
        result.push({ timestamp: cursor, frames: [] });
      }

      void found;
      cursor += sampleIntervalMs;
    }

    return result;
  }

  getBookmarks(eventId: string): SimulationBookmark[] {
    const persisted = this.events.get(eventId);
    if (!persisted) return [];
    return Array.from(persisted.bookmarks.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }

  addBookmark(bm: Omit<SimulationBookmark, 'id' | 'createdAt'>): SimulationBookmark | null {
    const persisted = this.events.get(bm.eventId);
    if (!persisted) return null;
    const full: SimulationBookmark = {
      ...bm,
      id: uid(),
      createdAt: Date.now(),
    };
    persisted.bookmarks.set(full.id, full);
    if (!persisted.event.bookmarks.includes(full.id)) {
      persisted.event.bookmarks.push(full.id);
    }
    return full;
  }

  deleteBookmark(eventId: string, bookmarkId: string): boolean {
    const persisted = this.events.get(eventId);
    if (!persisted) return false;
    const ok = persisted.bookmarks.delete(bookmarkId);
    if (ok) {
      persisted.event.bookmarks = persisted.event.bookmarks.filter(
        (id) => id !== bookmarkId
      );
    }
    return ok;
  }

  getIslandingDeltas(
    eventId: string,
    referenceTs?: number
  ): IslandingDelta[] {
    const persisted = this.events.get(eventId);
    if (!persisted) return [];

    const e = persisted.event;
    const beforeRef = referenceTs ?? e.timestamp - 1000;
    const afterRef = e.timestamp + 1000;

    const before = this.nearestSnapshot(eventId, beforeRef);
    const after = this.nearestSnapshot(eventId, afterRef);
    if (!before || !after) return [];

    const beforeMap = new Map(before.frames.map((f) => [f.stationId, f]));
    const afterMap = new Map(after.frames.map((f) => [f.stationId, f]));

    const deltas: IslandingDelta[] = [];
    const allStations = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    for (const stationId of allStations) {
      const bf = beforeMap.get(stationId);
      const af = afterMap.get(stationId);
      if (!bf || !af) continue;

      const phasorDeltas: IslandingDelta['delta']['phasorDeltas'] = [];
      const maxLen = Math.min(bf.phasors.length, af.phasors.length);
      for (let i = 0; i < maxLen; i++) {
        const bp = bf.phasors[i];
        const ap = af.phasors[i];
        const magDelta = ap.magnitude - bp.magnitude;
        const magDeltaPercent = bp.magnitude > 0 ? (magDelta / bp.magnitude) * 100 : 0;
        let angDelta = ap.angle - bp.angle;
        if (angDelta > 180) angDelta -= 360;
        if (angDelta < -180) angDelta += 360;
        phasorDeltas.push({
          name: ap.name || bp.name,
          magnitudeDelta: magDelta,
          magnitudeDeltaPercent: magDeltaPercent,
          angleDelta: angDelta,
          type: ap.type || bp.type,
        });
      }

      deltas.push({
        timestamp: e.timestamp,
        stationId,
        stationName: stationId,
        before: {
          frequency: bf.frequency,
          freqDeviation: bf.freqDeviation,
          phasors: bf.phasors.map((p) => ({ ...p })),
        },
        after: {
          frequency: af.frequency,
          freqDeviation: af.freqDeviation,
          phasors: af.phasors.map((p) => ({ ...p })),
        },
        delta: {
          frequencyDelta: af.frequency - bf.frequency,
          freqDeviationDelta: af.freqDeviation - bf.freqDeviation,
          phasorDeltas,
        },
      });
    }

    return deltas.sort((a, b) => {
      const aMaxAng = Math.max(
        ...a.delta.phasorDeltas.map((p) => Math.abs(p.angleDelta)),
        0
      );
      const bMaxAng = Math.max(
        ...b.delta.phasorDeltas.map((p) => Math.abs(p.angleDelta)),
        0
      );
      return bMaxAng - aMaxAng;
    });
  }

  private nearestSnapshot(eventId: string, ts: number): SnapshotBatch | null {
    const persisted = this.events.get(eventId);
    if (!persisted) return null;

    let best = -1;
    let bestDist = Infinity;
    for (const key of persisted.timeline.keys()) {
      const dist = Math.abs(key - ts);
      if (dist < bestDist && dist < 2000) {
        bestDist = dist;
        best = key;
      }
    }
    if (best < 0) return null;
    const bucket = persisted.timeline.get(best)!;
    return { timestamp: best, frames: Array.from(bucket.values()) };
  }

  ackEvent(eventId: string): boolean {
    const persisted = this.events.get(eventId);
    if (!persisted) return false;
    persisted.event.acknowledged = true;
    return true;
  }

  hasEvent(eventId: string): boolean {
    return this.events.has(eventId);
  }
}

export const sandboxEngine = new SandboxEngine();
