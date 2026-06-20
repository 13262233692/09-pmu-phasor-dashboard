import { EventEmitter } from 'node:events';
import type { PhasorData, AlarmMessage, StationConfig } from '../../shared/types';
import { config, DEFAULT_STATIONS } from '../config/default';

export class AlarmEngine extends EventEmitter {
  private stationData: Map<string, PhasorData> = new Map();
  private activeAlarms: Map<string, AlarmMessage> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private stations: StationConfig[] = DEFAULT_STATIONS;

  constructor() {
    super();
  }

  start(): void {
    this.checkInterval = setInterval(() => {
      this.checkAlarms();
    }, config.alarm.checkInterval);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  updateData(data: PhasorData): void {
    this.stationData.set(data.stationId, data);
  }

  setStations(stations: StationConfig[]): void {
    this.stations = stations;
  }

  private checkAlarms(): void {
    const dataArray = Array.from(this.stationData.values());
    
    if (dataArray.length === 0) return;

    const avgAngle = this.calculateAverageAngle(dataArray);
    
    for (const data of dataArray) {
      this.checkFrequencyAlarm(data);
      this.checkAngleAlarm(data, avgAngle);
      this.checkVoltageAlarm(data);
    }
  }

  private calculateAverageAngle(dataArray: PhasorData[]): number {
    let sumSin = 0;
    let sumCos = 0;

    for (const data of dataArray) {
      const voltagePhasors = data.phasors.filter((p) => p.type === 'voltage');
      if (voltagePhasors.length > 0) {
        const avgPhasor = voltagePhasors[0];
        const rad = (avgPhasor.angle * Math.PI) / 180;
        sumSin += Math.sin(rad);
        sumCos += Math.cos(rad);
      }
    }

    return (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  }

  private checkFrequencyAlarm(data: PhasorData): void {
    const { frequencyHigh, frequencyLow } = config.alarm;
    const alarmId = `freq:${data.stationId}`;

    if (data.frequency > frequencyHigh) {
      this.raiseAlarm({
        id: alarmId,
        timestamp: data.timestamp,
        stationId: data.stationId,
        type: 'frequency',
        level: data.frequency > frequencyHigh + 0.2 ? 'critical' : 'warning',
        message: `频率越限: ${data.frequency.toFixed(3)}Hz`,
        value: data.frequency,
        threshold: frequencyHigh,
      });
    } else if (data.frequency < frequencyLow) {
      this.raiseAlarm({
        id: alarmId,
        timestamp: data.timestamp,
        stationId: data.stationId,
        type: 'frequency',
        level: data.frequency < frequencyLow - 0.2 ? 'critical' : 'warning',
        message: `频率越限: ${data.frequency.toFixed(3)}Hz`,
        value: data.frequency,
        threshold: frequencyLow,
      });
    } else {
      this.clearAlarm(alarmId);
    }
  }

  private checkAngleAlarm(data: PhasorData, avgAngle: number): void {
    const voltagePhasors = data.phasors.filter((p) => p.type === 'voltage');
    if (voltagePhasors.length === 0) return;

    const { angleDiffMax } = config.alarm;
    const stationAngle = voltagePhasors[0].angle;
    let angleDiff = Math.abs(stationAngle - avgAngle);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;

    const alarmId = `angle:${data.stationId}`;

    if (angleDiff > angleDiffMax) {
      this.raiseAlarm({
        id: alarmId,
        timestamp: data.timestamp,
        stationId: data.stationId,
        type: 'angle',
        level: angleDiff > angleDiffMax + 10 ? 'critical' : 'warning',
        message: `相角差越限: ${angleDiff.toFixed(2)}°`,
        value: angleDiff,
        threshold: angleDiffMax,
      });
    } else {
      this.clearAlarm(alarmId);
    }
  }

  private checkVoltageAlarm(data: PhasorData): void {
    const { voltageHigh, voltageLow } = config.alarm;
    const station = this.stations.find((s) => s.name === data.stationId);
    const nominal = station?.nominalVoltage || 220;

    const voltagePhasors = data.phasors.filter((p) => p.type === 'voltage');
    
    for (const phasor of voltagePhasors) {
      const puValue = phasor.magnitude / nominal;
      const alarmId = `voltage:${data.stationId}:${phasor.name}`;

      if (puValue > voltageHigh) {
        this.raiseAlarm({
          id: alarmId,
          timestamp: data.timestamp,
          stationId: data.stationId,
          type: 'voltage',
          level: puValue > voltageHigh + 0.05 ? 'critical' : 'warning',
          message: `${phasor.name} 电压越限: ${phasor.magnitude.toFixed(2)}kV`,
          value: puValue,
          threshold: voltageHigh,
        });
      } else if (puValue < voltageLow) {
        this.raiseAlarm({
          id: alarmId,
          timestamp: data.timestamp,
          stationId: data.stationId,
          type: 'voltage',
          level: puValue < voltageLow - 0.05 ? 'critical' : 'warning',
          message: `${phasor.name} 电压越限: ${phasor.magnitude.toFixed(2)}kV`,
          value: puValue,
          threshold: voltageLow,
        });
      } else {
        this.clearAlarm(alarmId);
      }
    }
  }

  private raiseAlarm(alarm: AlarmMessage): void {
    const existing = this.activeAlarms.get(alarm.id);
    if (!existing || existing.level !== alarm.level || existing.message !== alarm.message) {
      this.activeAlarms.set(alarm.id, alarm);
      this.emit('alarm', alarm);
    }
  }

  private clearAlarm(alarmId: string): void {
    if (this.activeAlarms.delete(alarmId)) {
      this.emit('alarm-cleared', alarmId);
    }
  }

  getActiveAlarms(): AlarmMessage[] {
    return Array.from(this.activeAlarms.values());
  }

  getStationAlarms(stationId: string): AlarmMessage[] {
    return this.getActiveAlarms().filter((a) => a.stationId === stationId);
  }
}

export const alarmEngine = new AlarmEngine();
