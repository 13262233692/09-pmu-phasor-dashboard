import type { PhasorData, Phasor } from '../../shared/types';
import { config, DEFAULT_STATIONS } from '../config/default';

export class DataSimulator {
  private frameInterval: NodeJS.Timeout | null = null;
  private callbacks: Array<(data: PhasorData) => void> = [];
  private stationPhases: Map<string, {
    phase: number;
    drift: number;
    noise: number;
    clockOffsetMs: number;
    clockDriftRate: number;
    lastFrameCount: number;
  }> = new Map();
  private startTime: number = Date.now();
  private globalFrameCount: number = 0;

  constructor() {
    DEFAULT_STATIONS.forEach((station, index) => {
      this.stationPhases.set(station.name, {
        phase: (index * 72) % 360,
        drift: (index - 2) * 0.01,
        noise: 0.1 + index * 0.05,
        clockOffsetMs: (index - 2) * 3,
        clockDriftRate: (index - 2) * 0.0005,
        lastFrameCount: 0,
      });
    });
  }

  start(): void {
    const interval = 1000 / config.simulation.frameRate;
    this.frameInterval = setInterval(() => this.generateFrame(), interval);
    console.log('[Simulator] Started with', config.simulation.frameRate, 'fps, per-station clock drift enabled');
  }

  stop(): void {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
  }

  onData(callback: (data: PhasorData) => void): void {
    this.callbacks.push(callback);
  }

  private generateFrame(): void {
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;
    this.globalFrameCount++;

    DEFAULT_STATIONS.forEach((station, idx) => {
      const phaseState = this.stationPhases.get(station.name);
      if (!phaseState) return;

      phaseState.lastFrameCount++;

      const driftAccumulated = phaseState.clockDriftRate * this.globalFrameCount * 20;
      const timestamp = Math.round(
        now + phaseState.clockOffsetMs + driftAccumulated + (Math.random() - 0.5) * 0.5
      );

      const baseFrequency = 50 + Math.sin(elapsed * 0.1 + idx) * 0.02;
      const freqDeviation = baseFrequency - 50 + (Math.random() - 0.5) * 0.01;
      const frequency = 50 + freqDeviation;
      const rocof = Math.cos(elapsed * 0.1 + idx) * 0.01 + (Math.random() - 0.5) * 0.005;

      const phaseDrift = Math.sin(elapsed * 0.05 + phaseState.phase * Math.PI / 180) * 2;
      const noise = (Math.random() - 0.5) * phaseState.noise;

      const phasors: Phasor[] = [];

      for (let i = 0; i < 3; i++) {
        const angle = phaseState.phase + phaseDrift + noise + i * 120;
        const magnitude = 1.0 + Math.sin(elapsed * 0.2 + i + idx) * 0.02 + (Math.random() - 0.5) * 0.01;

        phasors.push({
          name: `V${'ABC'[i]}`,
          magnitude: magnitude * station.nominalVoltage,
          angle: this.normalizeAngle(angle),
          type: 'voltage',
        });
      }

      for (let i = 0; i < 3; i++) {
        const angle = phaseState.phase + phaseDrift + noise + i * 120 - 25 + (Math.random() - 0.5) * 2;
        const magnitude = 0.5 + Math.sin(elapsed * 0.3 + i + station.pmuId) * 0.1;

        phasors.push({
          name: `I${'ABC'[i]}`,
          magnitude: magnitude * 100,
          angle: this.normalizeAngle(angle),
          type: 'current',
        });
      }

      const data: PhasorData = {
        stationId: station.name,
        timestamp,
        frequency,
        freqDeviation,
        rocof,
        phasors,
        analogs: [],
        digitals: [],
        dataQuality: 0,
        pmuId: station.pmuId,
      };

      this.callbacks.forEach((cb) => cb(data));
    });
  }

  private normalizeAngle(angle: number): number {
    let normalized = angle % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
  }
}

export const dataSimulator = new DataSimulator();
