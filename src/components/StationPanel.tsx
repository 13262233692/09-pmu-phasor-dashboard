import React from 'react';
import { useDataStore } from '../store/useDataStore';
import type { PhasorData } from '../../shared/types';

export const StationPanel: React.FC = () => {
  const { stations, latestData, selectedStation, setSelectedStation, getStationColor } =
    useDataStore();

  const getStationLatest = (stationName: string): PhasorData | undefined => {
    return latestData.get(stationName);
  };

  return (
    <div className="panel h-full flex flex-col corner-decoration">
      <div className="corner-tl" />
      <div className="corner-br" />
      
      <div className="panel-header">
        <h2 className="panel-title">厂站列表</h2>
        <span className="text-xs text-neon-cyan/60 font-mono">{stations.length} 个厂站</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-tech p-3 space-y-2">
        {stations.map((station) => {
          const latest = getStationLatest(station.name);
          const isSelected = selectedStation === station.name;
          const color = station.color;

          const voltagePhasors = latest?.phasors.filter((p) => p.type === 'voltage') || [];
          const avgVoltage =
            voltagePhasors.length > 0
              ? voltagePhasors.reduce((sum, p) => sum + p.magnitude, 0) / voltagePhasors.length
              : 0;

          const mainAngle = voltagePhasors[0]?.angle || 0;

          return (
            <div
              key={station.id}
              onClick={() => setSelectedStation(isSelected ? null : station.name)}
              className={`relative p-3 rounded cursor-pointer transition-all duration-300 ${
                isSelected
                  ? 'bg-dark-600/80 border-2'
                  : 'bg-dark-700/50 border border-dark-500/30 hover:bg-dark-600/50 hover:border-neon-cyan/30'
              }`}
              style={{
                borderColor: isSelected ? color : undefined,
                boxShadow: isSelected ? `0 0 20px ${color}40` : undefined,
              }}
            >
              {isSelected && (
                <div
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                  }}
                />
              )}

              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`status-dot ${latest ? 'online' : 'offline'}`}
                  />
                  <span
                    className="font-display font-semibold text-sm"
                    style={{ color }}
                  >
                    {station.name}
                  </span>
                </div>
                <span className="text-xs text-gray-500 font-mono">#{station.pmuId}</span>
              </div>

              {latest ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="data-label">频率</span>
                    <span
                      className="font-mono text-sm"
                      style={{
                        color:
                          latest.frequency > 50.2 || latest.frequency < 49.8
                            ? '#ff3366'
                            : '#00ff88',
                      }}
                    >
                      {latest.frequency.toFixed(4)} Hz
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="data-label">频率偏差</span>
                    <span
                      className="font-mono text-sm"
                      style={{
                        color:
                          Math.abs(latest.freqDeviation) > 0.2
                            ? '#ffdd00'
                            : '#e0e0e0',
                      }}
                    >
                      {latest.freqDeviation > 0 ? '+' : ''}
                      {latest.freqDeviation.toFixed(4)} Hz
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="data-label">平均电压</span>
                    <span className="font-mono text-sm text-neon-cyan">
                      {avgVoltage.toFixed(2)} kV
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="data-label">相角</span>
                    <span className="font-mono text-sm text-neon-orange">
                      {mainAngle.toFixed(2)}°
                    </span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-dark-500/30">
                    <div className="flex gap-1">
                      {voltagePhasors.slice(0, 3).map((phasor, idx) => (
                        <div
                          key={idx}
                          className="flex-1 text-center p-1 rounded bg-dark-800/50"
                        >
                          <div className="text-[10px] text-gray-500 mb-0.5">
                            {phasor.name}
                          </div>
                          <div className="text-[10px] font-mono text-neon-cyan">
                            {phasor.magnitude.toFixed(0)}
                          </div>
                          <div
                            className="text-[10px] font-mono"
                            style={{ color }}
                          >
                            {phasor.angle.toFixed(1)}°
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-4">
                  <span className="text-xs text-gray-500 font-mono">等待数据...</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
