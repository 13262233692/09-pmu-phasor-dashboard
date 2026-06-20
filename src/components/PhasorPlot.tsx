import React, { useRef, useEffect, useCallback } from 'react';
import type { PhasorData, StationConfig } from '../../shared/types';
import { useDataStore } from '../store/useDataStore';

interface PhasorPlotProps {
  width?: number;
  height?: number;
}

interface TrailPoint {
  angle: number;
  magnitude: number;
  alpha: number;
}

interface StationTrail {
  points: TrailPoint[];
  maxPoints: number;
}

export const PhasorPlot: React.FC<PhasorPlotProps> = ({
  width = 600,
  height = 600,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const trailsRef = useRef<Map<string, StationTrail>>(new Map());
  const latestDataRef = useRef<Map<string, PhasorData>>(new Map());
  const rotationRef = useRef(0);
  const lastTimeRef = useRef(0);

  const { stations, selectedStation, setSelectedStation, getStationColor } =
    useDataStore();

  const latestData = useDataStore((state) => state.latestData);

  useEffect(() => {
    latestDataRef.current = latestData;
  }, [latestData]);

  useEffect(() => {
    stations.forEach((station) => {
      if (!trailsRef.current.has(station.name)) {
        trailsRef.current.set(station.name, {
          points: [],
          maxPoints: 30,
        });
      }
    });
  }, [stations]);

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) => {
      ctx.save();

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
      ctx.lineWidth = 1;

      for (let i = 1; i <= 4; i++) {
        const r = (radius / 4) * i;
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      for (let i = 0; i < 12; i++) {
        const angle = (i * 30 * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius
        );
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(0, 240, 255, 0.3)';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      for (let i = 0; i < 12; i++) {
        const angle = (i * 30 * Math.PI) / 180;
        const r = radius + 15;
        const angleDeg = (i * 30 + 90) % 360;
        ctx.fillText(
          `${angleDeg}°`,
          centerX + Math.cos(angle - Math.PI / 2) * r,
          centerY + Math.sin(angle - Math.PI / 2) * r + 4
        );
      }

      ctx.fillStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.font = 'bold 14px Orbitron';
      ctx.fillText('PHASOR DIAGRAM', centerX, centerY - radius - 25);

      ctx.restore();
    },
    []
  );

  const drawPhasor = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      centerX: number,
      centerY: number,
      radius: number,
      data: PhasorData,
      color: string,
      isSelected: boolean,
      rotation: number
    ) => {
      const voltagePhasors = data.phasors.filter((p) => p.type === 'voltage');
      if (voltagePhasors.length === 0) return;

      const mainPhasor = voltagePhasors[0];
      const maxMagnitude = 250;
      const scale = radius / maxMagnitude;
      const magnitude = Math.min(mainPhasor.magnitude * scale, radius * 0.95);
      const angleRad = ((mainPhasor.angle - 90 + rotation) * Math.PI) / 180;

      const endX = centerX + Math.cos(angleRad) * magnitude;
      const endY = centerY + Math.sin(angleRad) * magnitude;

      const trail = trailsRef.current.get(data.stationId);
      if (trail) {
        trail.points.unshift({
          angle: mainPhasor.angle,
          magnitude,
          alpha: 1,
        });
        if (trail.points.length > trail.maxPoints) {
          trail.points.pop();
        }

        trail.points.forEach((point, i) => {
          const pointAngleRad = ((point.angle - 90 + rotation) * Math.PI) / 180;
          const alpha = (1 - i / trail.maxPoints) * 0.6;
          const pointRadius = point.magnitude * (1 - i * 0.02);
          const pointX = centerX + Math.cos(pointAngleRad) * pointRadius;
          const pointY = centerY + Math.sin(pointAngleRad) * pointRadius;

          ctx.beginPath();
          ctx.arc(pointX, pointY, 3 * (1 - i / trail.maxPoints), 0, Math.PI * 2);
          ctx.fillStyle = color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
          ctx.fill();
        });
      }

      const gradient = ctx.createLinearGradient(centerX, centerY, endX, endY);
      gradient.addColorStop(0, color + '00');
      gradient.addColorStop(0.5, color + '80');
      gradient.addColorStop(1, color);

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = isSelected ? 20 : 10;
      ctx.strokeStyle = gradient;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const arrowLength = 12;
      const arrowAngle = Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowLength * Math.cos(angleRad - arrowAngle),
        endY - arrowLength * Math.sin(angleRad - arrowAngle)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowLength * Math.cos(angleRad + arrowAngle),
        endY - arrowLength * Math.sin(angleRad + arrowAngle)
      );
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(endX, endY, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(endX, endY, isSelected ? 8 : 6, 0, Math.PI * 2);
      ctx.strokeStyle = color + '80';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      const labelOffset = 25;
      const labelX = endX + Math.cos(angleRad) * labelOffset;
      const labelY = endY + Math.sin(angleRad) * labelOffset;

      ctx.save();
      ctx.font = isSelected ? 'bold 11px Orbitron' : '11px Orbitron';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillText(data.stationId, labelX, labelY);
      ctx.restore();
    },
    []
  );

  const drawReferenceCircle = useCallback(
    (ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, rotation: number) => {
      ctx.save();

      ctx.strokeStyle = 'rgba(255, 221, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const refAngle = ((-90 + rotation) * Math.PI) / 180;
      ctx.strokeStyle = 'rgba(255, 221, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(refAngle) * radius,
        centerY + Math.sin(refAngle) * radius
      );
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 221, 0, 0.8)';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText(
        'REF',
        centerX + Math.cos(refAngle) * radius + 5,
        centerY + Math.sin(refAngle) * radius + 4
      );

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

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 50;

    const render = (timestamp: number) => {
      if (timestamp - lastTimeRef.current < 16) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }
      lastTimeRef.current = timestamp;

      rotationRef.current += 0.05;
      if (rotationRef.current >= 360) rotationRef.current = 0;

      ctx.fillStyle = 'rgba(5, 8, 16, 0.95)';
      ctx.fillRect(0, 0, width, height);

      drawGrid(ctx, centerX, centerY, radius);
      drawReferenceCircle(ctx, centerX, centerY, radius, rotationRef.current);

      const dataArray = Array.from(latestDataRef.current.entries());
      for (const [stationId, data] of dataArray) {
        const color = getStationColor(stationId);
        const isSelected = selectedStation === stationId;
        drawPhasor(ctx, centerX, centerY, radius, data, color, isSelected, rotationRef.current);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [width, height, drawGrid, drawPhasor, drawReferenceCircle, selectedStation, getStationColor]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = width / 2;
      const centerY = height / 2;

      let closestStation: string | null = null;
      let minDistance = Infinity;

      const dataArray = Array.from(latestDataRef.current.entries());
      for (const [stationId, data] of dataArray) {
        const voltagePhasors = data.phasors.filter((p) => p.type === 'voltage');
        if (voltagePhasors.length === 0) continue;

        const mainPhasor = voltagePhasors[0];
        const maxMagnitude = 250;
        const scale = (Math.min(width, height) / 2 - 50) / maxMagnitude;
        const magnitude = Math.min(mainPhasor.magnitude * scale, (Math.min(width, height) / 2 - 50) * 0.95);
        const angleRad = ((mainPhasor.angle - 90 + rotationRef.current) * Math.PI) / 180;
        const endX = centerX + Math.cos(angleRad) * magnitude;
        const endY = centerY + Math.sin(angleRad) * magnitude;

        const distance = Math.sqrt((x - endX) ** 2 + (y - endY) ** 2);
        if (distance < 20 && distance < minDistance) {
          minDistance = distance;
          closestStation = stationId;
        }
      }

      if (closestStation) {
        setSelectedStation(selectedStation === closestStation ? null : closestStation);
      }
    },
    [width, height, selectedStation, setSelectedStation]
  );

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="cursor-pointer"
        style={{ width, height }}
      />
      <div className="absolute bottom-4 left-4 flex gap-2">
        {stations.slice(0, 5).map((station) => (
          <div
            key={station.id}
            className="flex items-center gap-1 px-2 py-1 rounded bg-dark-700/80 cursor-pointer hover:bg-dark-600 transition-colors"
            onClick={() =>
              setSelectedStation(selectedStation === station.name ? null : station.name)
            }
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: station.color, boxShadow: `0 0 6px ${station.color}` }}
            />
            <span className="text-xs font-mono" style={{ color: station.color }}>
              {station.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
