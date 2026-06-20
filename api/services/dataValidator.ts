import type { PhasorData, Phasor, StationConfig } from '../../shared/types';

const NOMINAL_VOLTAGE_MIN = 10;
const NOMINAL_VOLTAGE_MAX = 1500;
const NOMINAL_CURRENT_MIN = 0.1;
const NOMINAL_CURRENT_MAX = 10000;
const FREQUENCY_MIN = 40;
const FREQUENCY_MAX = 70;
const FREQ_DEVIATION_MAX = 10;
const ROCOF_MAX = 10;
const MAGNITUDE_VOLTAGE_RATIO_MAX = 20;
const MAGNITUDE_CURRENT_RATIO_MAX = 50;
const ANGLE_MIN = -360;
const ANGLE_MAX = 360;

const stationNominalCache: Map<string, { voltage: number; current: number }> = new Map();

export function registerStationNominal(stationId: string, voltageNominal: number, currentNominal: number = 100): void {
  stationNominalCache.set(stationId, {
    voltage: voltageNominal || 220,
    current: currentNominal || 100,
  });
}

function getStationNominal(stationId: string): { voltage: number; current: number } {
  return stationNominalCache.get(stationId) || { voltage: 220, current: 100 };
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

export interface ValidationResult {
  valid: boolean;
  corrected: PhasorData | null;
  errors: string[];
  warnings: string[];
}

export function validateAndCorrectPhasorData(
  data: PhasorData,
  stationConfig?: StationConfig
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, corrected: null, errors: ['Invalid data object'], warnings: [] };
  }

  if (!data.stationId || typeof data.stationId !== 'string') {
    errors.push('Missing or invalid stationId');
    return { valid: false, corrected: null, errors, warnings };
  }

  const nominals = stationConfig
    ? { voltage: stationConfig.nominalVoltage || 220, current: 100 }
    : getStationNominal(data.stationId);

  let hadCorrections = false;
  const corrected: PhasorData = { ...data };

  if (!isValidNumber(data.timestamp) || data.timestamp < 946684800000 || data.timestamp > 4102444800000) {
    warnings.push(`Invalid timestamp ${data.timestamp}, using current time`);
    corrected.timestamp = Date.now();
    hadCorrections = true;
  }

  if (!isValidNumber(data.frequency)) {
    errors.push(`Invalid frequency: ${data.frequency}`);
    corrected.frequency = 50;
    hadCorrections = true;
  } else if (data.frequency < FREQUENCY_MIN || data.frequency > FREQUENCY_MAX) {
    warnings.push(`Frequency out of range: ${data.frequency.toFixed(4)} Hz, clamped`);
    corrected.frequency = clamp(data.frequency, FREQUENCY_MIN, FREQUENCY_MAX);
    hadCorrections = true;
  }

  if (!isValidNumber(data.freqDeviation)) {
    corrected.freqDeviation = 0;
    hadCorrections = true;
  } else if (Math.abs(data.freqDeviation) > FREQ_DEVIATION_MAX) {
    warnings.push(`Freq deviation out of range: ${data.freqDeviation.toFixed(4)} Hz, clamped`);
    corrected.freqDeviation = clamp(data.freqDeviation, -FREQ_DEVIATION_MAX, FREQ_DEVIATION_MAX);
    hadCorrections = true;
  }

  if (!isValidNumber(data.rocof)) {
    corrected.rocof = 0;
    hadCorrections = true;
  } else if (Math.abs(data.rocof) > ROCOF_MAX) {
    warnings.push(`ROCOF out of range: ${data.rocof.toFixed(4)} Hz/s, clamped`);
    corrected.rocof = clamp(data.rocof, -ROCOF_MAX, ROCOF_MAX);
    hadCorrections = true;
  }

  if (!Array.isArray(data.phasors)) {
    errors.push('Phasors is not an array');
    corrected.phasors = [];
    return { valid: false, corrected: null, errors, warnings };
  }

  corrected.phasors = [];
  for (let i = 0; i < data.phasors.length; i++) {
    const ph = data.phasors[i];
    if (!ph || typeof ph !== 'object') {
      warnings.push(`Phasor ${i} is invalid, skipped`);
      continue;
    }

    const isVoltage = ph.type !== 'current';
    const nominal = isVoltage ? nominals.voltage : nominals.current;
    const maxMag = nominal * (isVoltage ? MAGNITUDE_VOLTAGE_RATIO_MAX : MAGNITUDE_CURRENT_RATIO_MAX);

    const correctedPh: Phasor = {
      name: ph.name || `PH${i}`,
      type: ph.type || (isVoltage ? 'voltage' : 'current'),
      magnitude: 0,
      angle: 0,
    };

    if (!isValidNumber(ph.magnitude)) {
      warnings.push(`Phasor ${i} (${ph.name}) magnitude invalid: ${ph.magnitude}, set to 0`);
      correctedPh.magnitude = 0;
      hadCorrections = true;
    } else if (ph.magnitude < 0 || ph.magnitude > maxMag * 10) {
      warnings.push(
        `Phasor ${i} (${ph.name}) magnitude out of range: ${ph.magnitude.toExponential(2)} ` +
        `(nominal ${nominal}), set to 0`
      );
      correctedPh.magnitude = 0;
      hadCorrections = true;
    } else if (ph.magnitude > maxMag) {
      warnings.push(
        `Phasor ${i} (${ph.name}) magnitude high: ${ph.magnitude.toFixed(2)} ` +
        `(nominal ${nominal}), clamped`
      );
      correctedPh.magnitude = clamp(ph.magnitude, 0, maxMag);
      hadCorrections = true;
    } else {
      correctedPh.magnitude = ph.magnitude;
    }

    if (!isValidNumber(ph.angle)) {
      warnings.push(`Phasor ${i} (${ph.name}) angle invalid: ${ph.angle}, set to 0`);
      correctedPh.angle = 0;
      hadCorrections = true;
    } else if (ph.angle < ANGLE_MIN || ph.angle > ANGLE_MAX) {
      correctedPh.angle = normalizeAngle(ph.angle);
      if (correctedPh.angle !== ph.angle) {
        hadCorrections = true;
      }
    } else {
      correctedPh.angle = ph.angle;
    }

    corrected.phasors.push(correctedPh);
  }

  if (!Array.isArray(data.analogs)) {
    corrected.analogs = [];
  } else {
    corrected.analogs = data.analogs.map((a, i) => {
      if (!isValidNumber(a)) {
        warnings.push(`Analog ${i} invalid: ${a}, set to 0`);
        hadCorrections = true;
        return 0;
      }
      if (Math.abs(a) > 1e6) {
        warnings.push(`Analog ${i} out of range: ${a.toExponential(2)}, clamped`);
        hadCorrections = true;
        return clamp(a, -1e6, 1e6);
      }
      return a;
    });
  }

  if (!Array.isArray(data.digitals)) {
    corrected.digitals = [];
  }

  if (!isValidNumber(data.dataQuality)) {
    corrected.dataQuality = 0;
    hadCorrections = true;
  } else {
    corrected.dataQuality = data.dataQuality & 0xFFFF;
  }

  if (!isValidNumber(data.pmuId)) {
    corrected.pmuId = 0;
    hadCorrections = true;
  }

  if (errors.length > 0) {
    return { valid: false, corrected: null, errors, warnings };
  }

  return {
    valid: true,
    corrected: hadCorrections ? corrected : data,
    errors,
    warnings,
  };
}
