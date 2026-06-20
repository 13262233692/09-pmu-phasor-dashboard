import React, { useRef, useEffect, useCallback } from 'react';
import { useDataStore } from '../store/useDataStore';

interface FrequencyWaveProps {
  width?: number;
  height?: number;
  showLegend?: boolean;
}

interface WaveData {
  points: number[];
  maxPoints: number;
  color: string;
  lastValue: number;
}

export const FrequencyWave: React.FC<FrequencyWaveProps> = ({
  width = 800,
  height = 300,
  showLegend = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const wavesRef = useRef<Map<string, WaveData>>(new Map());
  const lastTimeRef = useRef(0);
  const offsetRef = useRef(0);

  const { stations, selectedStation, getStationColor } = useDataStore();
  const frequencyHistory = useDataStore((state) => state.frequencyHistory);

  useEffect(() => {
    stations.forEach((station) => {
      if (!wavesRef.current.has(station.name)) {
        wavesRef.current.set(station.name, {
          points: [],
          maxPoints: 200,
          color: station.color,
          lastValue: 50,
        });
      }
    });
  }, [stations]);

  useEffect(() => {
    frequencyHistory.forEach((history, stationId) => {
      const wave = wavesRef.current.get(stationId);
      if (wave && history.length > 0) {
        const latest = history[history.length - 1];
        wave.lastValue = latest.value;
        wave.points.push(latest.value);
        if (wave.points.length > wave.maxPoints) {
          wave.points.shift();
        }
      }
    });
  }, [frequencyHistory]);

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.save();

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;

      const freqMin = 49.5;
      const freqMax = 50.5;
      const gridLines = 5;

      for (let i = 0; i <= gridLines; i++) {
        const y = (h / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        const freq = freqMax - ((freqMax - freqMin) / gridLines) * i;
        ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.font = '10px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText(`${freq.toFixed(1)}`, 4, y - 2);
      }

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      for (let i = 0; i < 10; i++) {
        const x = (w / 10) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255, 107, 53, 0.5)';
      ctx.setLineDash([4, 4]);
      const y50 = h - ((50 - freqMin) / (freqMax - freqMin)) * h;
      ctx.beginPath();
      ctx.moveTo(0, y50);
      ctx.lineTo(w, y50);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 107, 53, 0.8)';
      ctx.font = '10px JetBrains Mono';
      ctx.fillText('50.0Hz', w - 50, y50 - 2);

      ctx.strokeStyle = 'rgba(255, 51, 102, 0.3)';
      ctx.setLineDash([2, 2]);
      const yHigh = h - ((50.2 - freqMin) / (freqMax - freqMin)) * h;
      const yLow = h - ((49.8 - freqMin) / (freqMax - freqMin)) * h;
      ctx.beginPath();
      ctx.moveTo(0, yHigh);
      ctx.lineTo(w, yHigh);
      ctx.moveTo(0, yLow);
      ctx.lineTo(w, yLow);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.font = 'bold 14px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('FREQUENCY WAVEFORM', w / 2, 20);

      ctx.restore();
    },
    []
  );

  const drawWave = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      wave: WaveData,
      w: number,
      h: number,
      offset: number,
      isSelected: boolean,
      isDimmed: boolean
    ) => {
      if (wave.points.length < 2) return;

      const freqMin = 49.5;
      const freqMax = 50.5;
      const padding = 30;

      const alpha = isDimmed ? 0.15 : isSelected ? 1 : 0.6;

      ctx.save();

      const path = new Path2D();
      const pathGlow = new Path2D();

      for (let i = 0; i < wave.points.length; i++) {
        const x = padding + ((i / (wave.maxPoints - 1)) * (w - padding * 2) + offset) % (w - padding);
        const value = wave.points[i];
        const clampedValue = Math.max(freqMin, Math.min(freqMax, value));
        const y = h - padding - ((clampedValue - freqMin) / (freqMax - freqMin)) * (h - padding * 2);

        if (i === 0) {
          path.moveTo(x, y);
          pathGlow.moveTo(x, y);
        } else {
          const prevX = padding + (((i - 1) / (wave.maxPoints - 1)) * (w - padding * 2) + offset) % (w - padding);
          const prevValue = wave.points[i - 1];
          const prevClamped = Math.max(freqMin, Math.min(freqMax, prevValue));
          const prevY = h - padding - ((prevClamped - freqMin) / (freqMax - freqMin)) * (h - padding * 2);

          const cpx = (prevX + x) / 2;
          path.quadraticCurveTo(prevX, prevY, cpx, (prevY + y) / 2);
          pathGlow.quadraticCurveTo(prevX, prevY, cpx, (prevY + y) / 2);
        }
      }

      if (isSelected || !isDimmed) {
        ctx.shadowColor = wave.color;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(path);

        ctx.shadowBlur = 40;
        ctx.globalAlpha = 0.3;
        ctx.stroke(pathGlow);
        ctx.globalAlpha = 1;
      }

      ctx.shadowBlur = 0;
      const lastX = padding + (((wave.points.length - 1) / (wave.maxPoints - 1)) * (w - padding * 2) + offset) % (w - padding);
      const lastValue = wave.points[wave.points.length - 1];
      const lastClamped = Math.max(freqMin, Math.min(freqMax, lastValue));
      const lastY = h - padding - ((lastClamped - freqMin) / (freqMax - freqMin)) * (h - padding * 2);

      const gradient = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, 15);
      gradient.addColorStop(0, wave.color);
      gradient.addColorStop(0.5, wave.color + '80');
      gradient.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(lastX, lastY, 15, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(lastX, lastY, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = wave.color;
      ctx.shadowColor = wave.color;
      ctx.shadowBlur = 15;
      ctx.fill();

      if (isSelected) {
        ctx.fillStyle = wave.color;
        ctx.shadowBlur = 10;
        ctx.font = 'bold 12px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText(`${lastValue.toFixed(4)} Hz`, lastX + 12, lastY - 8);
      }

      ctx.restore();
    },
    []
  );

  const drawTrail = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      wave: WaveData,
      w: number,
      h: number,
      offset: number,
      isDimmed: boolean
    ) => {
      if (wave.points.length < 10) return;

      const freqMin = 49.5;
      const freqMax = 50.5;
      const padding = 30;
      const trailLength = 50;
      const startIdx = Math.max(0, wave.points.length - trailLength);

      ctx.save();

      for (let i = startIdx; i < wave.points.length - 1; i++) {
        const progress = (i - startIdx) / trailLength;
        const alpha = isDimmed ? progress * 0.1 : progress * 0.4;
        const lineWidth = 1 + progress * 3;

        const x1 = padding + ((i / (wave.maxPoints - 1)) * (w - padding * 2) + offset) % (w - padding);
        const value1 = wave.points[i];
        const clamped1 = Math.max(freqMin, Math.min(freqMax, value1));
        const y1 = h - padding - ((clamped1 - freqMin) / (freqMax - freqMin)) * (h - padding * 2);

        const x2 = padding + (((i + 1) / (wave.maxPoints - 1)) * (w - padding * 2) + offset) % (w - padding);
        const value2 = wave.points[i + 1];
        const clamped2 = Math.max(freqMin, Math.min(freqMax, value2));
        const y2 = h - padding - ((clamped2 - freqMin) / (freqMax - freqMin)) * (h - padding * 2);

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, wave.color + '00');
        gradient.addColorStop(1, wave.color + Math.floor(alpha * 255).toString(16).padStart(2, '0'));

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      ctx.restore();
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const render = (timestamp: number) => {
      if (timestamp - lastTimeRef.current < 16) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }
      lastTimeRef.current = timestamp;

      offsetRef.current -= 0.5;
      if (offsetRef.current <= -width) {
        offsetRef.current = 0;
      }

      ctx.fillStyle = 'rgba(5, 8, 16, 0.95)';
      ctx.fillRect(0, 0, width, height);

      drawGrid(ctx, width, height);

      const wavesArray = Array.from(wavesRef.current.entries());
      for (const [stationId, wave] of wavesArray) {
        const isSelected = selectedStation === stationId;
        const isDimmed = selectedStation !== null && !isSelected;

        drawTrail(ctx, wave, width, height, offsetRef.current, isDimmed);
        drawWave(ctx, wave, width, height, offsetRef.current, isSelected, isDimmed);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [width, height, drawGrid, drawWave, drawTrail, selectedStation]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{ width, height }}
      />
      {showLegend && (
        <div className="absolute top-4 right-4 flex flex-col gap-1 bg-dark-800/80 rounded p-2">
          {stations.slice(0, 5).map((station) => {
            const wave = wavesRef.current.get(station.name);
            const isSelected = selectedStation === station.name;
            const isDimmed = selectedStation !== null && !isSelected;

            return (
              <div
                key={station.id}
                className={`flex items-center gap-2 px-2 py-1 rounded transition-all cursor-pointer ${
                  isSelected ? 'bg-dark-600' : 'hover:bg-dark-700'
                } ${isDimmed ? 'opacity-40' : ''}`}
              >
                <div
                  className="w-3 h-1 rounded"
                  style={{ backgroundColor: station.color, boxShadow: `0 0 4px ${station.color}` }}
                />
                <span className="text-xs font-mono" style={{ color: station.color }}>
                  {station.name}
                </span>
                <span className="text-xs text-gray-400 font-mono ml-2">
                  {wave?.lastValue.toFixed(3)} Hz
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
