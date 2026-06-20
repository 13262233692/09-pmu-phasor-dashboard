import Redis from 'ioredis';
import { config } from '../config/default';
import type { PhasorData, StationConfig } from '../../shared/types';

export class RedisClient {
  private client: Redis | null = null;
  private useMemory: boolean = false;
  private streamKey = 'wams:stream:phasors';
  private latestKeyPrefix = 'wams:station:';

  private memoryStream: PhasorData[] = [];
  private memoryLatest: Map<string, PhasorData> = new Map();
  private memoryOnline: Map<string, number> = new Map();
  private memoryConfigs: Map<string, StationConfig> = new Map();
  private connectPromise: Promise<void> | null = null;

  constructor() {
    this.connectPromise = this.initConnection();
  }

  private async initConnection(): Promise<void> {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
      });

      this.client.on('error', (err) => {
        if (!this.useMemory) {
          console.log('[Redis] Connection failed, switching to memory mode');
          this.useMemory = true;
        }
      });

      this.client.on('connect', () => {
        console.log('[Redis] Connected successfully');
        this.useMemory = false;
      });

      await this.client.connect().catch(() => {
        console.log('[Redis] Connection failed, using memory mode');
        this.useMemory = true;
      });
    } catch (err) {
      console.log('[Redis] Init failed, using memory mode');
      this.useMemory = true;
    }
  }

  async waitForReady(): Promise<void> {
    if (this.connectPromise) {
      await this.connectPromise;
    }
  }

  private isReady(): boolean {
    return !this.useMemory && this.client !== null && this.client.status === 'ready';
  }

  async addPhasorData(data: PhasorData): Promise<void> {
    if (this.isReady() && this.client) {
      try {
        const fields: Record<string, string | number> = {
          stationId: data.stationId,
          timestamp: data.timestamp,
          frequency: data.frequency,
          freqDeviation: data.freqDeviation,
          rocof: data.rocof,
          dataQuality: data.dataQuality,
          pmuId: data.pmuId,
        };

        data.phasors.forEach((p, i) => {
          fields[`phasor_${i}_name`] = p.name;
          fields[`phasor_${i}_mag`] = p.magnitude;
          fields[`phasor_${i}_ang`] = p.angle;
          fields[`phasor_${i}_type`] = p.type;
        });

        data.analogs.forEach((a, i) => {
          fields[`analog_${i}`] = a;
        });

        await this.client.xadd(
          this.streamKey,
          'MAXLEN',
          '~',
          config.redis.streamMaxLen,
          '*',
          ...Object.entries(fields).flatMap(([k, v]) => [k, String(v)])
        );
      } catch (err) {
        this.useMemory = true;
      }
    }

    this.memoryStream.push(data);
    if (this.memoryStream.length > config.redis.streamMaxLen) {
      this.memoryStream.shift();
    }

    await this.updateLatestData(data);
  }

  async updateLatestData(data: PhasorData): Promise<void> {
    if (this.isReady() && this.client) {
      try {
        const key = `${this.latestKeyPrefix}${data.stationId}:latest`;
        await this.client.hset(key, {
          timestamp: String(data.timestamp),
          frequency: String(data.frequency),
          freqDeviation: String(data.freqDeviation),
          phasors: JSON.stringify(data.phasors),
          status: 'online',
          dataQuality: String(data.dataQuality),
        });
        await this.client.expire(key, 5);
        return;
      } catch (err) {
        this.useMemory = true;
      }
    }

    this.memoryLatest.set(data.stationId, data);
  }

  async getLatestData(stationId: string): Promise<PhasorData | null> {
    if (this.isReady() && this.client) {
      try {
        const key = `${this.latestKeyPrefix}${stationId}:latest`;
        const data = await this.client.hgetall(key);
        
        if (!data || Object.keys(data).length === 0) {
          return null;
        }

        return {
          stationId,
          timestamp: parseInt(data.timestamp, 10),
          frequency: parseFloat(data.frequency),
          freqDeviation: parseFloat(data.freqDeviation),
          rocof: parseFloat(data.rocof || '0'),
          phasors: JSON.parse(data.phasors || '[]'),
          analogs: [],
          digitals: [],
          dataQuality: parseInt(data.dataQuality || '0', 10),
          pmuId: parseInt(data.pmuId || '0', 10),
        };
      } catch (err) {
        this.useMemory = true;
      }
    }

    return this.memoryLatest.get(stationId) || null;
  }

  async readLatest(batchSize: number = 100): Promise<PhasorData[]> {
    if (this.isReady() && this.client) {
      try {
        const results = await this.client.xrevrange(
          this.streamKey,
          '+',
          '-',
          'COUNT',
          batchSize
        );

        return results
          .map(([_, fields]) => {
            const data: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              data[fields[i]] = fields[i + 1];
            }

            const phasors: Array<{ name: string; magnitude: number; angle: number; type: 'voltage' | 'current' }> = [];
            let i = 0;
            while (data[`phasor_${i}_name`]) {
              phasors.push({
                name: data[`phasor_${i}_name`],
                magnitude: parseFloat(data[`phasor_${i}_mag`]),
                angle: parseFloat(data[`phasor_${i}_ang`]),
                type: (data[`phasor_${i}_type`] as 'voltage' | 'current'),
              });
              i++;
            }

            return {
              stationId: data.stationId,
              timestamp: parseInt(data.timestamp, 10),
              frequency: parseFloat(data.frequency),
              freqDeviation: parseFloat(data.freqDeviation),
              rocof: parseFloat(data.rocof || '0'),
              phasors,
              analogs: [],
              digitals: [],
              dataQuality: parseInt(data.dataQuality || '0', 10),
              pmuId: parseInt(data.pmuId || '0', 10),
            };
          })
          .filter((d): d is PhasorData => d !== null && d !== undefined);
      } catch (err) {
        this.useMemory = true;
      }
    }

    return this.memoryStream.slice(-batchSize).reverse();
  }

  async saveStationConfig(station: StationConfig): Promise<void> {
    if (this.isReady() && this.client) {
      try {
        await this.client.hset('wams:config:stations', station.id, JSON.stringify(station));
        return;
      } catch (err) {
        this.useMemory = true;
      }
    }

    this.memoryConfigs.set(station.id, station);
  }

  async getStationConfigs(): Promise<StationConfig[]> {
    if (this.isReady() && this.client) {
      try {
        const data = await this.client.hgetall('wams:config:stations');
        return Object.values(data).map((json) => JSON.parse(json));
      } catch (err) {
        this.useMemory = true;
      }
    }

    return Array.from(this.memoryConfigs.values());
  }

  async deleteStationConfig(id: string): Promise<void> {
    if (this.isReady() && this.client) {
      try {
        await this.client.hdel('wams:config:stations', id);
        return;
      } catch (err) {
        this.useMemory = true;
      }
    }

    this.memoryConfigs.delete(id);
  }

  async setOnlineStation(stationId: string): Promise<void> {
    if (this.isReady() && this.client) {
      try {
        await this.client.setex(`wams:online:${stationId}`, 5, '1');
        return;
      } catch (err) {
        this.useMemory = true;
      }
    }

    this.memoryOnline.set(stationId, Date.now());
  }

  async getOnlineStations(): Promise<string[]> {
    if (this.isReady() && this.client) {
      try {
        const keys = await this.client.keys('wams:online:*');
        return keys.map((k) => k.replace('wams:online:', ''));
      } catch (err) {
        this.useMemory = true;
      }
    }

    const now = Date.now();
    const online: string[] = [];
    for (const [id, timestamp] of this.memoryOnline.entries()) {
      if (now - timestamp < 5000) {
        online.push(id);
      }
    }
    return online;
  }

  isUsingMemory(): boolean {
    return this.useMemory;
  }

  getClient(): Redis | null {
    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch (err) {
        // ignore
      }
    }
  }
}

export const redisClient = new RedisClient();
