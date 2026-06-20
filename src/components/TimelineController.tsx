import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSandboxStore, SANDBOX_SPEED_OPTIONS } from '../store/useSandboxStore';
import type { SimulationBookmark, IslandingEvent } from '../../shared/types';
import { useDataStore } from '../store/useDataStore';

interface TimelineProps {
  onClose: () => void;
}

function formatTime(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const f = Math.floor((ms % 1000) / 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${f.toString().padStart(2, '0')}`;
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d
    .getMilliseconds()
    .toString()
    .padStart(3, '0')}`;
}

export function TimelineController({ onClose }: TimelineProps) {
  const {
    activeEventId,
    events,
    loadEvents,
    selectEvent,
    setCurrentIndex,
    currentSnapshotIndex,
    snapshots,
    playbackSpeed,
    setPlaybackSpeed,
    isPlaying,
    setIsPlaying,
    bookmarks,
    jumpToBookmark,
    addBookmark,
    deleteBookmark,
    getCurrentFrames,
  } = useSandboxStore();

  const event = useMemo(
    () => events.find((e) => e.id === activeEventId) || null,
    [events, activeEventId]
  );

  const activeEvent = useSandboxStore((s) =>
    s.events.find((e) => e.id === s.activeEventId)
  );
  void activeEvent;

  const [hoverBookmark, setHoverBookmark] = useState<SimulationBookmark | null>(
    null
  );
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const replayTimerRef = useRef<number | null>(null);

  const duration = useMemo(() => {
    if (!event) return 40000;
    return event.postWindowEnd - event.preWindowStart;
  }, [event]);

  const timeRangeStart = event?.preWindowStart ?? Date.now() - 10000;
  const timeRangeEnd = event?.postWindowEnd ?? Date.now() + 30000;
  const eventTs = event?.timestamp ?? Date.now();

  const currentTs = useMemo(() => {
    if (snapshots.length === 0) return timeRangeStart;
    const idx = Math.max(
      0,
      Math.min(snapshots.length - 1, currentSnapshotIndex)
    );
    return snapshots[idx]?.timestamp ?? timeRangeStart;
  }, [snapshots, currentSnapshotIndex, timeRangeStart]);

  const progressPct = useMemo(() => {
    const total = timeRangeEnd - timeRangeStart;
    if (total <= 0) return 0;
    return ((currentTs - timeRangeStart) / total) * 100;
  }, [currentTs, timeRangeStart, timeRangeEnd]);

  const eventPct = useMemo(() => {
    const total = timeRangeEnd - timeRangeStart;
    if (total <= 0) return 0;
    return ((eventTs - timeRangeStart) / total) * 100;
  }, [eventTs, timeRangeStart, timeRangeEnd]);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || snapshots.length === 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      const idx = Math.round(pct * (snapshots.length - 1));
      setCurrentIndex(idx);
    },
    [snapshots, setCurrentIndex]
  );

  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      setIsPlaying(false);
      handleTrackClick(e);

      const onMove = (ev: MouseEvent) => {
        if (!trackRef.current || !draggingRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const idx = Math.round(pct * (snapshots.length - 1));
        setCurrentIndex(idx);
      };

      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [snapshots, setCurrentIndex, handleTrackClick, setIsPlaying]
  );

  const togglePlay = () => setIsPlaying(!isPlaying);

  const step = (frames: number) => {
    setCurrentIndex(currentSnapshotIndex + frames);
  };

  const goToStart = () => setCurrentIndex(0);
  const goToEnd = () => setCurrentIndex(Math.max(0, snapshots.length - 1));

  const doAddBookmark = () => {
    if (!bookmarkTitle.trim()) return;
    addBookmark(bookmarkTitle.trim());
    setBookmarkTitle('');
    setShowBookmarkDialog(false);
  };

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (events.length > 0 && !activeEventId) {
      selectEvent(events[0].id);
    }
  }, [events, activeEventId, selectEvent]);

  useEffect(() => {
    if (replayTimerRef.current) {
      window.clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    if (!isPlaying || snapshots.length === 0) return;

    const interval = Math.max(16, Math.round(20 / playbackSpeed));
    replayTimerRef.current = window.setInterval(() => {
      useSandboxStore.getState().tickReplay();
    }, interval);

    return () => {
      if (replayTimerRef.current) {
        window.clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, snapshots.length]);

  const bookmarkPositions = useMemo(() => {
    const total = timeRangeEnd - timeRangeStart;
    if (total <= 0) return [];
    return bookmarks.map((bm) => ({
      ...bm,
      pct: ((bm.timestamp - timeRangeStart) / total) * 100,
    }));
  }, [bookmarks, timeRangeStart, timeRangeEnd]);

  const currentFrames = getCurrentFrames();

  const stationAngles = useMemo(() => {
    const result: Array<{
      id: string;
      color: string;
      angle: number;
      freq: number;
    }> = [];
    const { getStationColor } = useDataStore.getState();
    for (const frame of currentFrames) {
      const ph = frame.phasors.find((p) => p.type === 'voltage');
      result.push({
        id: frame.stationId,
        color: getStationColor(frame.stationId),
        angle: ph?.angle ?? 0,
        freq: frame.frequency,
      });
    }
    return result;
  }, [currentFrames]);

  const relativeTime = currentTs - (event?.timestamp ?? 0);

  return (
    <div className="w-full h-full flex flex-col bg-dark-800/98 backdrop-blur-md border-t-2 border-neon-cyan/40 select-none">
      <div className="flex items-center justify-between px-5 py-3 border-b border-dark-600/60 bg-gradient-to-b from-dark-700/80 to-dark-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-8 bg-gradient-to-b from-neon-cyan to-neon-green rounded" />
            <h2 className="text-neon-cyan text-lg font-display tracking-wider">
              沙盘推演 · 孤岛穿越历史回放
            </h2>
          </div>

          <select
            className="bg-dark-900 border border-dark-500 text-neon-cyan px-3 py-1.5 rounded text-sm font-mono focus:border-neon-cyan focus:outline-none"
            value={activeEventId || ''}
            onChange={(e) => selectEvent(e.target.value)}
          >
            {events.length === 0 && (
              <option value="">暂无事件 · 模拟数据运行中...</option>
            )}
            {events.map((e: IslandingEvent) => (
              <option key={e.id} value={e.id}>
                [{e.severity.toUpperCase()}] {e.title} · {formatClock(e.timestamp)}
              </option>
            ))}
          </select>

          {event && (
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono ${
                  event.severity === 'warning'
                    ? 'bg-neon-yellow/20 text-neon-yellow border border-neon-yellow/40'
                    : event.severity === 'critical'
                    ? 'bg-neon-orange/20 text-neon-orange border border-neon-orange/40'
                    : 'bg-neon-red/20 text-neon-red border border-neon-red/40'
                }`}
              >
                {event.severity}
              </span>
              <span className="text-gray-500 text-xs font-mono">
                {event.affectedStations.length} 站受影响
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-mono">
            <span className="text-gray-500">速度</span>
            <div className="flex bg-dark-900 rounded overflow-hidden border border-dark-500">
              {SANDBOX_SPEED_OPTIONS.map((sp) => (
                <button
                  key={sp}
                  onClick={() => setPlaybackSpeed(sp)}
                  className={`px-2 py-1 text-xs transition-all ${
                    playbackSpeed === sp
                      ? 'bg-neon-cyan text-dark-900 font-bold'
                      : 'text-gray-400 hover:text-neon-cyan hover:bg-dark-600'
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowBookmarkDialog(true)}
            className="px-3 py-1.5 bg-neon-yellow/15 text-neon-yellow border border-neon-yellow/40 rounded hover:bg-neon-yellow/25 text-xs transition-all"
          >
            + 打点书签
          </button>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded bg-dark-700 hover:bg-neon-red/20 text-gray-400 hover:text-neon-red transition-all flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 px-5 py-2 border-b border-dark-600/40 bg-dark-800/50">
        <div className="flex items-center gap-1 bg-dark-900 rounded p-1">
          <button
            onClick={goToStart}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-neon-cyan hover:bg-dark-700 transition-all"
            title="跳转到开始"
          >
            ⏮
          </button>
          <button
            onClick={() => step(-5)}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-neon-cyan hover:bg-dark-700 transition-all"
            title="后退 5 帧"
          >
            ⏪
          </button>
          <button
            onClick={togglePlay}
            className={`w-10 h-8 flex items-center justify-center rounded text-lg transition-all ${
              isPlaying
                ? 'bg-neon-orange text-dark-900 hover:bg-neon-orange/80'
                : 'bg-neon-cyan text-dark-900 hover:bg-neon-cyan/80'
            }`}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => step(5)}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-neon-cyan hover:bg-dark-700 transition-all"
            title="前进 5 帧"
          >
            ⏩
          </button>
          <button
            onClick={goToEnd}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-neon-cyan hover:bg-dark-700 transition-all"
            title="跳转到结束"
          >
            ⏭
          </button>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-neon-cyan font-bold w-24">
            {formatTime(relativeTime)}
          </span>
          <span className="text-gray-600">/</span>
          <span className="text-gray-400 w-24">{formatTime(duration)}</span>
          <span
            className={`ml-2 w-2 h-2 rounded-full ${
              isPlaying ? 'bg-neon-green animate-pulse' : 'bg-gray-600'
            }`}
          />
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">相对时间 T</span>
            <span
              className={`font-bold ${
                relativeTime < 0 ? 'text-neon-cyan' : 'text-neon-orange'
              }`}
            >
              {relativeTime >= 0 ? '+' : ''}
              {(relativeTime / 1000).toFixed(2)}s
            </span>
          </div>
          <div className="w-px h-4 bg-dark-600" />
          <span className="text-gray-400">{formatClock(currentTs)}</span>
        </div>
      </div>

      <div className="flex-1 px-5 py-3 relative">
        <div className="flex gap-3 mb-2 text-[10px] font-mono">
          <span className="text-neon-cyan">
            {formatClock(timeRangeStart)}
          </span>
          <div className="flex-1 text-center">
            <span className="text-neon-orange font-bold">
              {formatClock(eventTs)} · 解列时刻
            </span>
          </div>
          <span className="text-neon-green">{formatClock(timeRangeEnd)}</span>
        </div>

        <div
          ref={trackRef}
          onMouseDown={handleTrackMouseDown}
          className="relative h-24 bg-dark-900/60 rounded-lg border border-dark-500/60 cursor-pointer overflow-visible group"
        >
          <div className="absolute inset-x-0 top-0 h-8 border-b border-dark-600/40">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="absolute top-0 w-px h-full bg-dark-600/30"
                style={{ left: `${i * 10}%` }}
              />
            ))}
          </div>

          <div className="absolute inset-x-0 bottom-0 h-16">
            <svg className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="freqBg" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                fill="url(#freqBg)"
              />
              {stationAngles.length > 0 &&
                snapshots.length > 1 && (
                  <>
                    {stationAngles.map((st) => {
                      const color = st.color;
                      const pts: string[] = [];
                      const step = Math.max(
                        1,
                        Math.floor(snapshots.length / 200)
                      );
                      for (let i = 0; i < snapshots.length; i += step) {
                        const s = snapshots[i];
                        if (!s) continue;
                        const f = s.frames.find(
                          (x) => x.stationId === st.id
                        );
                        const pct = (i / (snapshots.length - 1)) * 100;
                        const baseY = 64;
                        const amp = 28;
                        const ang =
                          f?.phasors.find((p) => p.type === 'voltage')?.angle ??
                          0;
                        const y =
                          baseY -
                          ((ang / 180) * amp + st.angle / 180) * amp * 0.3;
                        pts.push(`${pct}%,${y}`);
                      }
                      return (
                        <polyline
                          key={st.id}
                          points={pts.join(' ')}
                          fill="none"
                          stroke={color}
                          strokeWidth="1.5"
                          opacity="0.7"
                        />
                      );
                    })}
                  </>
                )}
            </svg>
          </div>

          <div
            className="absolute top-0 h-full w-0.5 bg-neon-orange/60 pointer-events-none"
            style={{ left: `${eventPct}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-neon-orange text-dark-900 rounded text-[10px] font-bold whitespace-nowrap">
              T0
            </div>
          </div>

          {bookmarkPositions.map((bm) => (
            <button
              key={bm.id}
              onClick={(ev) => {
                ev.stopPropagation();
                jumpToBookmark(bm);
              }}
              onMouseEnter={() => setHoverBookmark(bm)}
              onMouseLeave={() => setHoverBookmark(null)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                if (confirm(`删除书签 "${bm.title}"?`)) deleteBookmark(bm.id);
              }}
              className="absolute bottom-0 -translate-x-1/2 w-2.5 h-4 rounded-t-sm transition-all hover:scale-125 group/bm"
              style={{
                left: `${bm.pct}%`,
                backgroundColor: bm.color,
                boxShadow: `0 0 8px ${bm.color}`,
              }}
            >
              {hoverBookmark?.id === bm.id && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-dark-900 border border-dark-500 rounded text-[10px] text-white whitespace-nowrap z-50">
                  <div className="font-bold" style={{ color: bm.color }}>
                    {bm.title}
                  </div>
                  <div className="text-gray-500 font-mono">
                    {formatClock(bm.timestamp)}
                  </div>
                  {bm.note && <div className="text-gray-400">{bm.note}</div>}
                </div>
              )}
            </button>
          ))}

          <div
            className="absolute top-0 h-full pointer-events-none"
            style={{ left: `${progressPct}%` }}
          >
            <div className="absolute top-0 bottom-0 -left-px w-0.5 bg-neon-cyan shadow-[0_0_8px_#00f0ff]" />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-neon-cyan border-2 border-dark-900 shadow-[0_0_12px_#00f0ff]" />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 text-[10px] font-mono">
          <div className="flex gap-4">
            {stationAngles.slice(0, 5).map((st) => (
              <div key={st.id} className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: st.color }}
                />
                <span className="text-gray-400">{st.id}</span>
                <span className="text-white/80">∠{st.angle.toFixed(1)}°</span>
                <span className="text-neon-green">{st.freq.toFixed(3)}Hz</span>
              </div>
            ))}
          </div>
          <div className="text-gray-500">
            帧 {currentSnapshotIndex + 1} / {snapshots.length} · 间隔 20ms
          </div>
        </div>
      </div>

      {showBookmarkDialog && (
        <div className="absolute inset-x-0 bottom-full flex justify-center mb-2 z-50">
          <div className="bg-dark-800 border border-dark-500 rounded-lg p-3 shadow-2xl flex items-center gap-2">
            <span className="text-neon-cyan text-sm">书签名称</span>
            <input
              autoFocus
              type="text"
              value={bookmarkTitle}
              onChange={(e) => setBookmarkTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doAddBookmark()}
              placeholder="输入书签名称..."
              className="bg-dark-900 border border-dark-500 rounded px-2 py-1 text-sm text-white w-56 focus:border-neon-cyan focus:outline-none font-mono"
            />
            <button
              onClick={doAddBookmark}
              className="px-3 py-1 bg-neon-cyan text-dark-900 rounded text-sm font-bold hover:bg-neon-cyan/80"
            >
              确认
            </button>
            <button
              onClick={() => setShowBookmarkDialog(false)}
              className="px-2 py-1 text-gray-400 hover:text-white text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
