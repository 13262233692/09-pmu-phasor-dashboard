import { useMemo } from 'react';
import { useSandboxStore } from '../store/useSandboxStore';
import type { IslandingDelta } from '../../shared/types';

interface DeltaPanelProps {
  onClose: () => void;
}

function deltaClass(val: number, threshold: number): string {
  const abs = Math.abs(val);
  if (abs > threshold * 2) return 'text-neon-red font-bold';
  if (abs > threshold) return 'text-neon-orange';
  if (abs > threshold * 0.5) return 'text-neon-yellow';
  return 'text-neon-green';
}

function DeltaBar({
  value,
  max,
  unit,
  suffix,
}: {
  value: number;
  max: number;
  unit: string;
  suffix: string;
}) {
  const pct = Math.max(-100, Math.min(100, (value / max) * 100));
  const isPositive = pct >= 0;
  const color =
    Math.abs(pct) > 80
      ? 'bg-neon-red'
      : Math.abs(pct) > 50
      ? 'bg-neon-orange'
      : Math.abs(pct) > 25
      ? 'bg-neon-yellow'
      : 'bg-neon-green';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-dark-800 rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-dark-500" />
        <div
          className={`absolute inset-y-0 ${color} rounded-full transition-all`}
          style={{
            left: isPositive ? '50%' : `${50 + pct / 2}%`,
            width: `${Math.abs(pct) / 2}%`,
          }}
        />
      </div>
      <span className={`font-mono text-[10px] w-16 text-right ${deltaClass(value, max * 0.5)}`}>
        {isPositive ? '+' : ''}
        {value.toFixed(unit === '°' ? 2 : unit === '%' ? 2 : 3)}
        {unit}
        {suffix ? ` (${suffix})` : ''}
      </span>
    </div>
  );
}

function StationCard({ delta }: { delta: IslandingDelta }) {
  const totalAngleImpact = useMemo(() => {
    const voltageDeltas = delta.delta.phasorDeltas.filter(
      (p) => p.type === 'voltage'
    );
    return voltageDeltas.reduce(
      (sum, p) => sum + Math.abs(p.angleDelta),
      0
    );
  }, [delta]);

  const severity =
    totalAngleImpact > 60
      ? { label: '极严重', color: 'neon-red', border: 'neon-red/40' }
      : totalAngleImpact > 30
      ? { label: '严重', color: 'neon-orange', border: 'neon-orange/40' }
      : totalAngleImpact > 10
      ? { label: '警告', color: 'neon-yellow', border: 'neon-yellow/40' }
      : { label: '正常', color: 'neon-green', border: 'neon-green/40' };

  return (
    <div
      className={`bg-dark-800/80 rounded-lg border border-${severity.border} p-3 backdrop-blur-sm`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-6 rounded bg-${severity.color} shadow-[0_0_8px_var(--tw-shadow-color)]`}
            style={{ ['--tw-shadow-color' as any]: `var(--color-${severity.color})` }}
          />
          <span className="font-display text-white text-sm tracking-wider">
            {delta.stationName}
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono bg-${severity.color}/15 text-${severity.color} border border-${severity.color}/40`}
        >
          {severity.label}
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-14 text-[10px] text-gray-500 font-mono">Δ频率</span>
          <DeltaBar
            value={delta.delta.frequencyDelta}
            max={1}
            unit="Hz"
            suffix=""
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 text-[10px] text-gray-500 font-mono">Δ频偏</span>
          <DeltaBar
            value={delta.delta.freqDeviationDelta}
            max={1}
            unit="Hz"
            suffix=""
          />
        </div>
      </div>

      <div className="border-t border-dark-600/40 pt-2">
        <div className="text-[10px] text-gray-500 font-mono mb-1.5">
          相量变化详情
        </div>
        <div className="space-y-1">
          {delta.delta.phasorDeltas.map((pd) => (
            <div key={pd.name} className="flex items-center gap-2">
              <span
                className={`w-8 text-[10px] font-mono ${
                  pd.type === 'voltage' ? 'text-neon-cyan' : 'text-neon-yellow'
                }`}
              >
                {pd.name}
              </span>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-10 text-[9px] text-gray-600 font-mono">
                    幅值
                  </span>
                  <DeltaBar
                    value={pd.magnitudeDeltaPercent}
                    max={30}
                    unit="%"
                    suffix={`${pd.magnitudeDelta.toFixed(1)}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10 text-[9px] text-gray-600 font-mono">
                    相角
                  </span>
                  <DeltaBar value={pd.angleDelta} max={60} unit="°" suffix="" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-dark-600/40 grid grid-cols-3 gap-1 text-[9px] font-mono">
        <div className="text-center">
          <div className="text-gray-500">前频率</div>
          <div className="text-neon-cyan">{delta.before.frequency.toFixed(4)}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">后频率</div>
          <div className="text-neon-orange">{delta.after.frequency.toFixed(4)}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">冲击度</div>
          <div className={`text-${severity.color} font-bold`}>
            {totalAngleImpact.toFixed(1)}°
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeltaFloatingPanel({ onClose }: DeltaPanelProps) {
  const { deltas, showDeltaPanel, setShowDeltaPanel, activeEventId } =
    useSandboxStore();

  if (!showDeltaPanel || activeEventId === null) return null;

  const totalImpact = useMemo(() => {
    return deltas.reduce((sum, d) => {
      const v = d.delta.phasorDeltas.filter((p) => p.type === 'voltage');
      return sum + v.reduce((s, p) => s + Math.abs(p.angleDelta), 0);
    }, 0);
  }, [deltas]);

  return (
    <div className="absolute right-4 top-20 w-96 max-h-[calc(100%-280px)] flex flex-col bg-dark-900/95 border border-neon-orange/30 rounded-xl shadow-2xl backdrop-blur-xl z-40 animate-in slide-in-from-right-8 duration-300">
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600/50 bg-gradient-to-r from-neon-orange/10 to-transparent rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-8 bg-gradient-to-b from-neon-orange to-neon-red rounded-full" />
          <div>
            <h3 className="text-neon-orange font-display text-sm tracking-wider">
              解列瞬间 · 电气参数差值分析
            </h3>
            <div className="text-[10px] text-gray-500 font-mono mt-0.5">
              基于 T=-1s / T=+1s 对称窗口
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-dark-700 hover:bg-neon-red/20 text-gray-400 hover:text-neon-red transition-all flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-2 border-b border-dark-600/40 bg-dark-800/50 grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[9px] text-gray-500 font-mono">受影响站</div>
          <div className="text-neon-cyan font-bold font-mono">
            {deltas.length}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 font-mono">冲击度</div>
          <div
            className={`font-bold font-mono ${
              totalImpact > 100
                ? 'text-neon-red'
                : totalImpact > 50
                ? 'text-neon-orange'
                : totalImpact > 20
                ? 'text-neon-yellow'
                : 'text-neon-green'
            }`}
          >
            {totalImpact.toFixed(1)}°
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 font-mono">最大Δ频</div>
          <div className="text-neon-yellow font-bold font-mono">
            {deltas.length > 0
              ? (
                  Math.max(
                    ...deltas.map((d) => Math.abs(d.delta.frequencyDelta))
                  ) || 0
                ).toFixed(4)
              : '0.0000'}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 font-mono">最大Δ角</div>
          <div className="text-neon-red font-bold font-mono">
            {deltas.length > 0
              ? (
                  Math.max(
                    ...deltas.flatMap((d) =>
                      d.delta.phasorDeltas.map((p) => Math.abs(p.angleDelta))
                    )
                  ) || 0
                ).toFixed(1)
              : '0.0'}
            °
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
        {deltas.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs">
            暂无差值数据 · 请先选择孤岛事件
          </div>
        )}
        {deltas.map((d) => (
          <StationCard key={d.stationId} delta={d} />
        ))}
      </div>

      <div className="px-4 py-2 border-t border-dark-600/40 text-[10px] text-gray-500 font-mono flex items-center justify-between">
        <span>右键书签可删除 · 拖动时间轴观察实时相量</span>
        <button
          onClick={() => setShowDeltaPanel(false)}
          className="text-neon-cyan hover:text-neon-cyan/80"
        >
          收起
        </button>
      </div>
    </div>
  );
}
