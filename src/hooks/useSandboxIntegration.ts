import { useEffect, useRef } from 'react';
import { useSandboxStore } from '../store/useSandboxStore';
import { useDataStore } from '../store/useDataStore';
import type { PhasorData } from '../../shared/types';

export function useSandboxIntegration() {
  const { isSandboxOpen, snapshots, currentSnapshotIndex, isPlaying, getCurrentFrames, tickReplay, activeEventId } =
    useSandboxStore();
  const { addPhasorData } = useDataStore();

  const lastIdxRef = useRef(-1);

  useEffect(() => {
    if (!isSandboxOpen) {
      lastIdxRef.current = -1;
      return;
    }
  }, [isSandboxOpen]);

  useEffect(() => {
    if (!isSandboxOpen || activeEventId === null) return;
    if (snapshots.length === 0) return;

    const frames = getCurrentFrames();
    if (frames.length === 0) return;

    if (lastIdxRef.current === currentSnapshotIndex) return;
    lastIdxRef.current = currentSnapshotIndex;

    const injected: PhasorData[] = frames.map((f) => ({ ...f }));
    addPhasorData(injected);
  }, [
    isSandboxOpen,
    activeEventId,
    snapshots,
    currentSnapshotIndex,
    isPlaying,
    getCurrentFrames,
    addPhasorData,
  ]);

  useEffect(() => {
    if (!isSandboxOpen || !isPlaying || activeEventId === null) return;

    let frameHandle: number | null = null;
    const loop = () => {
      const frames = tickReplay();
      if (frames && frames.length > 0) {
        addPhasorData(frames);
      }
      frameHandle = requestAnimationFrame(loop);
    };

    frameHandle = requestAnimationFrame(loop);
    return () => {
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
    };
  }, [isSandboxOpen, isPlaying, activeEventId, tickReplay, addPhasorData]);
}
