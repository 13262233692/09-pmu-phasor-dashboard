import type { PhasorData } from '../../shared/types';
import { config } from '../config/default';
import { createRequire } from 'module';

type DataCallback = (data: PhasorData) => void;

class PMUBridge {
  private decoder: any = null;
  private callbacks: DataCallback[] = [];
  private useNative: boolean = false;
  private isStarted: boolean = false;

  constructor() {
    try {
      const require = createRequire(import.meta.url);
      const bindings = require('bindings');
      const addon = bindings('pmu_decoder');
      this.decoder = new addon.PMUDecoder();
      this.useNative = true;
      console.log('[PMU] Native C++ addon loaded successfully');
    } catch (err) {
      console.log('[PMU] Native addon not available, using fallback mode');
      console.log('[PMU] Error:', (err as Error).message);
      this.useNative = false;
    }
  }

  start(): boolean {
    if (this.isStarted) return true;

    if (this.useNative && this.decoder) {
      const result = this.decoder.start(
        config.udp.multicastAddress,
        config.udp.port,
        config.udp.interface
      );
      
      if (result) {
        this.decoder.setCallback((data: PhasorData) => {
          this.notifyCallbacks(data);
        });
        this.isStarted = true;
        console.log('[PMU] Native decoder started on', config.udp.multicastAddress + ':' + config.udp.port);
        return true;
      }
      return false;
    }

    console.log('[PMU] Running in simulation mode (no native addon)');
    this.isStarted = true;
    return true;
  }

  stop(): void {
    if (this.useNative && this.decoder) {
      this.decoder.stop();
    }
    this.isStarted = false;
  }

  onData(callback: DataCallback): void {
    this.callbacks.push(callback);
  }

  notifyCallbacks(data: PhasorData): void {
    this.callbacks.forEach((cb) => cb(data));
  }

  isRunning(): boolean {
    if (this.useNative && this.decoder) {
      return this.decoder.isRunning();
    }
    return this.isStarted;
  }

  hasNativeAddon(): boolean {
    return this.useNative;
  }
}

export const pmuBridge = new PMUBridge();
