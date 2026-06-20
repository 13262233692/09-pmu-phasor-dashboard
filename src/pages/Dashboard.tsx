import React, { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSandboxIntegration } from '../hooks/useSandboxIntegration';
import { StatusBar } from '../components/StatusBar';
import { StationPanel } from '../components/StationPanel';
import { PhasorPlot } from '../components/PhasorPlot';
import { FrequencyWave } from '../components/FrequencyWave';
import { AlarmBar } from '../components/AlarmBar';
import { TimelineController } from '../components/TimelineController';
import { DeltaFloatingPanel } from '../components/DeltaFloatingPanel';
import { useDataStore } from '../store/useDataStore';
import { useSandboxStore } from '../store/useSandboxStore';

export const Dashboard: React.FC = () => {
  useWebSocket();
  useSandboxIntegration();
  const { selectedStation, systemStatus } = useDataStore();
  const { isSandboxOpen, openSandbox, closeSandbox, events, loadEvents } =
    useSandboxStore();
  const [alertPulse, setAlertPulse] = useState(false);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (systemStatus.activeAlarms > 0) {
      setAlertPulse(true);
      const t = setTimeout(() => setAlertPulse(false), 800);
      return () => clearTimeout(t);
    }
  }, [systemStatus.activeAlarms]);

  return (
    <div className="w-full h-full flex flex-col bg-dark-900 overflow-hidden relative">
      <StatusBar />

      <div className="flex-1 flex overflow-hidden p-4 gap-4 relative">
        <div className="w-72 flex-shrink-0">
          <StationPanel />
        </div>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <div className="flex-1 flex gap-4 min-h-0">
            <div className="flex-1 panel corner-decoration overflow-hidden flex items-center justify-center">
              <div className="corner-tl" />
              <div className="corner-br" />
              <PhasorPlot width={650} height={550} />

              {events.length > 0 && !isSandboxOpen && (
                <button
                  onClick={openSandbox}
                  className={`absolute bottom-4 right-4 z-20 group flex items-center gap-2 px-4 py-2 rounded-lg border backdrop-blur-md transition-all animate-pulse ${
                    alertPulse
                      ? 'bg-neon-orange/25 border-neon-orange/60 text-neon-orange shadow-[0_0_30px_#ff6b3550] animate-none'
                      : 'bg-neon-orange/15 border-neon-orange/40 text-neon-orange hover:bg-neon-orange/25 hover:shadow-[0_0_20px_#ff6b3540]'
                  }`}
                >
                  <span className="text-lg">🎞️</span>
                  <div className="text-left leading-tight">
                    <div className="text-sm font-display font-bold tracking-wider">
                      沙盘推演 · 历史回放
                    </div>
                    <div className="text-[10px] font-mono opacity-80">
                      {events.length} 次孤岛穿越事件
                    </div>
                  </div>
                  <span className="ml-1 text-xs opacity-70 group-hover:opacity-100 transition-opacity">
                    ▶ 打开
                  </span>
                </button>
              )}
            </div>

            <div className="w-80 flex-shrink-0 flex flex-col gap-4">
              <div className="panel corner-decoration flex-1 p-4">
                <div className="corner-tl" />
                <div className="corner-br" />
                <div className="panel-header -mx-4 -mt-4 mb-4">
                  <h2 className="panel-title">系统概览</h2>
                </div>
                <div className="space-y-4">
                  <SystemMetricCard
                    label="PMU 数据采样率"
                    value="50 Hz"
                    subValue="每秒 50 帧"
                    color="#00f0ff"
                    icon="⚡"
                  />
                  <SystemMetricCard
                    label="协议标准"
                    value="IEEE C37.118"
                    subValue="2011 版本"
                    color="#ff6b35"
                    icon="📡"
                  />
                  <SystemMetricCard
                    label="通信方式"
                    value="UDP 组播"
                    subValue="239.255.0.1:4712"
                    color="#00ff88"
                    icon="🌐"
                  />
                  <SystemMetricCard
                    label="数据存储"
                    value="Redis 流"
                    subValue="内存时序数据库"
                    color="#a855f7"
                    icon="💾"
                  />
                </div>
              </div>

              <div className="panel corner-decoration flex-1 p-4">
                <div className="corner-tl" />
                <div className="corner-br" />
                <div className="panel-header -mx-4 -mt-4 mb-4">
                  <h2 className="panel-title">实时指标</h2>
                </div>
                <RealtimeMetrics />
              </div>
            </div>
          </div>

          <div className="h-72 panel corner-decoration overflow-hidden">
            <div className="corner-tl" />
            <div className="corner-br" />
            <FrequencyWave width={1200} height={260} />
          </div>
        </div>

        <DeltaFloatingPanel onClose={() => useSandboxStore.getState().setShowDeltaPanel(false)} />
      </div>

      {isSandboxOpen && (
        <div className="h-64 flex-shrink-0 border-t border-neon-cyan/40 shadow-[0_-4px_20px_rgba(0,240,255,0.1)]">
          <TimelineController onClose={closeSandbox} />
        </div>
      )}

      {isSandboxOpen && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full bg-neon-cyan/15 border border-neon-cyan/50 backdrop-blur-md text-neon-cyan text-xs font-display tracking-widest animate-pulse">
          ◉ 沙盘推演模式 · 历史快照正在回放 · {useSandboxStore.getState().playbackSpeed}x 速度
        </div>
      )}

      <AlarmBar />
    </div>
  );
};

const SystemMetricCard: React.FC<{
  label: string;
  value: string;
  subValue: string;
  color: string;
  icon: string;
}> = ({ label, value, subValue, color, icon }) => {
  return (
    <div className="relative p-3 rounded bg-dark-700/50 border border-dark-500/30 hover:border-neon-cyan/30 transition-all">
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}80, transparent)`,
        }}
      />
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded flex items-center justify-center text-xl"
          style={{
            backgroundColor: `${color}20`,
            border: `1px solid ${color}50`,
          }}
        >
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-0.5">{label}</div>
          <div
            className="font-display font-bold text-lg"
            style={{ color }}
          >
            {value}
          </div>
          <div className="text-[10px] text-gray-500 font-mono">{subValue}</div>
        </div>
      </div>
    </div>
  );
};

const RealtimeMetrics: React.FC = () => {
  const { latestData, selectedStation } = useDataStore();

  const displayData = selectedStation
    ? latestData.get(selectedStation)
    : latestData.size > 0
    ? Array.from(latestData.values())[0]
    : null;

  if (!displayData) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-gray-500 text-sm font-mono">等待数据...</span>
      </div>
    );
  }

  const voltagePhasors = displayData.phasors.filter((p) => p.type === 'voltage');
  const currentPhasors = displayData.phasors.filter((p) => p.type === 'current');

  return (
    <div className="space-y-3">
      <div
        className="text-xs font-display font-semibold mb-2"
        style={{ color: selectedStation ? useDataStore.getState().getStationColor(selectedStation) : '#00f0ff' }}
      >
        {selectedStation || 'STATION_A'} 实时数据
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded bg-dark-800/50 border border-dark-500/30">
          <div className="text-[10px] text-gray-500 mb-1">频率</div>
          <div className="font-mono text-lg text-neon-green font-bold">
            {displayData.frequency.toFixed(4)}
            <span className="text-xs ml-1">Hz</span>
          </div>
        </div>
        <div className="p-2 rounded bg-dark-800/50 border border-dark-500/30">
          <div className="text-[10px] text-gray-500 mb-1">频率偏差</div>
          <div
            className="font-mono text-lg font-bold"
            style={{
              color: Math.abs(displayData.freqDeviation) > 0.2 ? '#ffdd00' : '#00f0ff',
            }}
          >
            {displayData.freqDeviation > 0 ? '+' : ''}
            {displayData.freqDeviation.toFixed(4)}
            <span className="text-xs ml-1">Hz</span>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] text-gray-500 mb-1.5">电压相量</div>
        <div className="space-y-1">
          {voltagePhasors.map((p, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-1.5 rounded bg-dark-800/30 border border-dark-500/20"
            >
              <span className="text-xs font-mono text-neon-cyan">{p.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-gray-300">
                  {p.magnitude.toFixed(1)}
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: '#ff6b35' }}
                >
                  {p.angle > 0 ? '+' : ''}
                  {p.angle.toFixed(2)}°
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-gray-500 mb-1.5">电流相量</div>
        <div className="space-y-1">
          {currentPhasors.map((p, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-1.5 rounded bg-dark-800/30 border border-dark-500/20"
            >
              <span className="text-xs font-mono text-neon-purple">{p.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-gray-300">
                  {p.magnitude.toFixed(1)}
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: '#ff6b35' }}
                >
                  {p.angle > 0 ? '+' : ''}
                  {p.angle.toFixed(2)}°
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-dark-500/30 flex justify-between text-[10px] text-gray-500 font-mono">
        <span>数据质量: {displayData.dataQuality}</span>
        <span>PMU ID: {displayData.pmuId}</span>
      </div>
    </div>
  );
};
