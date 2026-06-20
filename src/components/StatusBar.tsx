import React, { useState, useEffect } from 'react';
import { Activity, Zap, Clock, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';

export const StatusBar: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { systemStatus, connected, fps } = useDataStore();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-14 bg-dark-800/90 border-b border-neon-cyan/30 flex items-center justify-between px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-neon-cyan/5 via-transparent to-neon-cyan/5" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-cyan to-transparent" />

      <div className="flex items-center gap-8 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-dark-700 flex items-center justify-center border border-neon-cyan/50">
            <Zap className="w-6 h-6 text-neon-cyan" style={{ filter: 'drop-shadow(0 0 8px #00f0ff)' }} />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-neon-cyan glow-text tracking-wider">
              WAMS CONTROL CENTER
            </h1>
            <p className="text-xs text-gray-500 font-mono">Wide Area Measurement System</p>
          </div>
        </div>

        <div className="h-8 w-px bg-neon-cyan/20" />

        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="data-label">系统时间</span>
            <span className="data-value text-neon-cyan">{formatTime(currentTime)}</span>
          </div>
          <div className="flex flex-col">
            <span className="data-label">日期</span>
            <span className="data-value text-gray-300">{formatDate(currentTime)}</span>
          </div>
          <div className="flex flex-col">
            <span className="data-label">运行时间</span>
            <span className="data-value text-neon-green">{formatUptime(systemStatus.uptime)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 relative z-10">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-dark-700/50 border border-neon-cyan/30">
          <Activity className="w-4 h-4 text-neon-cyan" />
          <span className="text-xs text-gray-400">刷新率</span>
          <span className="text-sm font-mono text-neon-cyan font-bold">{fps} fps</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-dark-700/50 border border-neon-cyan/30">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-neon-green animate-pulse' : 'bg-neon-red'}`} />
          {connected ? (
            <Wifi className="w-4 h-4 text-neon-green" />
          ) : (
            <WifiOff className="w-4 h-4 text-neon-red" />
          )}
          <span className="text-xs font-mono" style={{ color: connected ? '#00ff88' : '#ff3366' }}>
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="data-label">厂站在线</span>
            <span className="data-value text-neon-green font-bold">
              {systemStatus.onlineStations}/{systemStatus.totalStations}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="data-label">平均频率</span>
            <span className="data-value text-neon-cyan font-bold">
              {systemStatus.avgFrequency.toFixed(3)} Hz
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="data-label">最大相角差</span>
            <span
              className="data-value font-bold"
              style={{
                color: systemStatus.maxAngleDiff > 20 ? '#ff3366' : systemStatus.maxAngleDiff > 10 ? '#ffdd00' : '#00ff88',
              }}
            >
              {systemStatus.maxAngleDiff.toFixed(2)}°
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="data-label">活动告警</span>
            <span
              className="data-value font-bold flex items-center gap-1"
              style={{ color: systemStatus.activeAlarms > 0 ? '#ff3366' : '#00ff88' }}
            >
              {systemStatus.activeAlarms > 0 && (
                <AlertTriangle className="w-3 h-3 animate-pulse" />
              )}
              {systemStatus.activeAlarms}
            </span>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/50 to-transparent">
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-neon-cyan to-transparent"
          style={{
            animation: 'scan 3s linear infinite',
            opacity: 0.5,
          }}
        />
      </div>
    </div>
  );
};
