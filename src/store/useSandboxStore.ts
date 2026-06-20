import { create } from 'zustand';
import type {
  IslandingEvent,
  SimulationBookmark,
  SnapshotBatch,
  IslandingDelta,
  PhasorData,
} from '../../shared/types';

interface ReplayState {
  isSandboxOpen: boolean;
  activeEventId: string | null;
  events: IslandingEvent[];
  snapshots: SnapshotBatch[];
  bookmarks: SimulationBookmark[];
  deltas: IslandingDelta[];

  playbackSpeed: number;
  currentSnapshotIndex: number;
  isPlaying: boolean;
  showDeltaPanel: boolean;
  deltaSnapshotTs: number | null;

  openSandbox: () => void;
  closeSandbox: () => void;
  loadEvents: () => Promise<void>;
  selectEvent: (eventId: string) => Promise<void>;
  setPlaybackSpeed: (speed: number) => void;
  setCurrentIndex: (idx: number) => void;
  setIsPlaying: (playing: boolean) => void;
  tickReplay: () => PhasorData[] | null;
  getCurrentFrames: () => PhasorData[];
  addBookmark: (title: string, color?: string, note?: string) => Promise<void>;
  deleteBookmark: (id: string) => Promise<void>;
  jumpToBookmark: (bm: SimulationBookmark) => void;
  setShowDeltaPanel: (show: boolean) => void;
  setDeltaSnapshotTs: (ts: number | null) => void;
  loadDeltas: () => Promise<void>;
}

const BASE_URL = '/api/sandbox';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE_URL + path, options);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || 'API error');
  return json.data as T;
}

const speedOptions = [0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export const useSandboxStore = create<ReplayState>((set, get) => ({
  isSandboxOpen: false,
  activeEventId: null,
  events: [],
  snapshots: [],
  bookmarks: [],
  deltas: [],
  playbackSpeed: 0.5,
  currentSnapshotIndex: 0,
  isPlaying: false,
  showDeltaPanel: true,
  deltaSnapshotTs: null,

  openSandbox: () => set({ isSandboxOpen: true }),
  closeSandbox: () =>
    set({
      isSandboxOpen: false,
      isPlaying: false,
      activeEventId: null,
      snapshots: [],
      bookmarks: [],
      deltas: [],
    }),

  loadEvents: async () => {
    try {
      const events = await api<IslandingEvent[]>('/events');
      set({ events });
    } catch (err) {
      console.error('[Sandbox] Failed to load events:', err);
    }
  },

  selectEvent: async (eventId: string) => {
    try {
      const [tlRes, bmRes, deltaRes] = await Promise.all([
        api<{ snapshots: SnapshotBatch[]; total: number }>(
          `/events/${eventId}/timeline?interval=20`
        ),
        api<SimulationBookmark[]>(`/events/${eventId}/bookmarks`),
        api<IslandingDelta[]>(`/events/${eventId}/deltas`),
      ]);
      set({
        activeEventId: eventId,
        snapshots: tlRes.snapshots,
        bookmarks: bmRes,
        deltas: deltaRes,
        currentSnapshotIndex: Math.max(
          0,
          tlRes.snapshots.findIndex(
            (s) =>
              s.timestamp >=
              (tlRes.snapshots[0]?.timestamp ?? 0) + 5000
          )
        ),
        isPlaying: false,
      });
    } catch (err) {
      console.error('[Sandbox] Failed to select event:', err);
    }
  },

  setPlaybackSpeed: (speed) => {
    const nearest = speedOptions.reduce((prev, curr) =>
      Math.abs(curr - speed) < Math.abs(prev - speed) ? curr : prev
    );
    set({ playbackSpeed: nearest });
  },

  setCurrentIndex: (idx) =>
    set({
      currentSnapshotIndex: Math.max(
        0,
        Math.min(get().snapshots.length - 1, idx)
      ),
    }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  tickReplay: () => {
    const { snapshots, currentSnapshotIndex, playbackSpeed, isPlaying } = get();
    if (!isPlaying || snapshots.length === 0) return null;

    const advance = Math.max(1, Math.round(playbackSpeed));
    const newIdx = Math.min(snapshots.length - 1, currentSnapshotIndex + advance);
    set({
      currentSnapshotIndex: newIdx,
      isPlaying: newIdx < snapshots.length - 1 ? true : false,
    });
    return snapshots[newIdx]?.frames || [];
  },

  getCurrentFrames: () => {
    const { snapshots, currentSnapshotIndex } = get();
    return snapshots[currentSnapshotIndex]?.frames || [];
  },

  addBookmark: async (title, color = '#ffdd00', note) => {
    const { activeEventId, snapshots, currentSnapshotIndex } = get();
    if (!activeEventId) return;
    const ts = snapshots[currentSnapshotIndex]?.timestamp || Date.now();
    try {
      const bm = await api<SimulationBookmark>(`/events/${activeEventId}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: ts, title, color, note }),
      });
      set((s) => ({ bookmarks: [...s.bookmarks, bm] }));
    } catch (err) {
      console.error('[Sandbox] Failed to add bookmark:', err);
    }
  },

  deleteBookmark: async (id) => {
    const { activeEventId } = get();
    if (!activeEventId) return;
    try {
      await api(`/events/${activeEventId}/bookmarks/${id}`, { method: 'DELETE' });
      set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
    } catch (err) {
      console.error('[Sandbox] Failed to delete bookmark:', err);
    }
  },

  jumpToBookmark: (bm) => {
    const { snapshots } = get();
    if (snapshots.length === 0) return;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < snapshots.length; i++) {
      const d = Math.abs(snapshots[i].timestamp - bm.timestamp);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    set({ currentSnapshotIndex: bestIdx, isPlaying: false });
  },

  setShowDeltaPanel: (show) => set({ showDeltaPanel: show }),
  setDeltaSnapshotTs: (ts) => set({ deltaSnapshotTs: ts }),

  loadDeltas: async () => {
    const { activeEventId } = get();
    if (!activeEventId) return;
    try {
      const deltas = await api<IslandingDelta[]>(`/events/${activeEventId}/deltas`);
      set({ deltas });
    } catch (err) {
      console.error('[Sandbox] Failed to load deltas:', err);
    }
  },
}));

export const SANDBOX_SPEED_OPTIONS = speedOptions;
