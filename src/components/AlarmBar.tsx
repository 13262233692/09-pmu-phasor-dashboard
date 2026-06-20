import React, { useRef, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';

export const AlarmBar: React.FC = () => {
  const { alarms } = useDataStore();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollContent = container.querySelector('.scroll-content');
    if (!scrollContent) return;

    const clone = scrollContent.cloneNode(true);
    container.appendChild(clone);

    let position = 0;
    const speed = 0.5;

    const animate = () => {
      position -= speed;
      const contentWidth = scrollContent.scrollWidth;
      if (position <= -contentWidth) {
        position = 0;
      }
      (container.firstChild as HTMLElement).style.transform = `translateX(${position}px)`;
      (container.lastChild as HTMLElement).style.transform = `translateX(${position}px)`;
      requestAnimationFrame(animate);
    };

    if (alarms.length > 0) {
      const animationId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animationId);
    }
  }, [alarms.length]);

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'critical':
        return <AlertCircle className="w-4 h-4" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'critical':
        return { bg: 'bg-neon-red/20', border: 'border-neon-red', text: '#ff3366' };
      case 'warning':
        return { bg: 'bg-neon-yellow/20', border: 'border-neon-yellow', text: '#ffdd00' };
      default:
        return { bg: 'bg-neon-cyan/20', border: 'border-neon-cyan', text: '#00f0ff' };
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (alarms.length === 0) {
    return (
      <div className="h-10 bg-dark-800/80 border-t border-neon-green/30 flex items-center justify-center">
        <div className="flex items-center gap-2 text-neon-green/60">
          <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
          <span className="text-xs font-mono">系统运行正常，无活动告警</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-10 bg-dark-800/90 border-t border-neon-red/30 flex items-center overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-dark-800 to-transparent z-10 flex items-center px-3">
        <div className="flex items-center gap-2 text-neon-red">
          <AlertTriangle className="w-4 h-4 animate-pulse" />
          <span className="text-xs font-display font-bold tracking-wider">告警信息</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative ml-32"
        style={{ maskImage: 'linear-gradient(to right, transparent, black 50px, black calc(100% - 50px), transparent)' }}
      >
        <div className="scroll-content flex items-center gap-4 whitespace-nowrap py-1">
          {alarms.map((alarm) => {
            const colors = getLevelColor(alarm.level);
            return (
              <div
                key={alarm.id}
                className={`flex items-center gap-2 px-3 py-1 rounded border ${colors.bg} ${colors.border}`}
                style={{ color: colors.text }}
              >
                {getLevelIcon(alarm.level)}
                <span className="text-xs font-mono text-gray-500">
                  {formatTime(alarm.timestamp)}
                </span>
                <span className="text-xs font-mono font-bold">{alarm.stationId}</span>
                <span className="text-xs">|</span>
                <span className="text-xs">{alarm.message}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-dark-800 to-transparent z-10 flex items-center justify-end px-3">
        <span className="text-xs font-mono text-neon-red">
          {alarms.length} 条告警
        </span>
      </div>
    </div>
  );
};
