/**
 * RDDensityChart — histogram of the running variable with fitted density
 * curves on each side of the cutoff (McCrary-style density test).
 *
 * Shows:
 *   - Bar histogram of running-variable density
 *   - Smooth local-linear fit on each side (coloured differently)
 *   - Vertical reference line at the cutoff
 *   - Annotation for the gap (if any) at the cutoff
 */
import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface BinPoint {
  mid: number;
  density: number;
  isLeft: boolean;
}

interface CurvePoint {
  x: number;
  y: number;
}

interface DensityChartData {
  bins: BinPoint[];
  leftCurve: CurvePoint[];
  rightCurve: CurvePoint[];
  cutoff: number;
  leftDensityAtCutoff: number;
  rightDensityAtCutoff: number;
  xAxisLabel: string;
  yAxisLabel: string;
  title: string;
}

interface RDDensityChartProps {
  chartData: DensityChartData;
  zStat: number | null;
  pValue: number | null;
  passed: boolean | null;
}

const LEFT_COLOR  = '#4F9CF9';
const RIGHT_COLOR = '#FF6B6B';
const CUTOFF_COLOR = '#6b7280';
const GRID_COLOR  = '#e5e7eb';

interface CustomTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: BinPoint & { x?: number } }>;
  cutoff: number;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, cutoff }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as BinPoint & { x?: number };
  const xVal = d.mid ?? d.x ?? 0;
  const densityLabel =
    d.density != null && Number.isFinite(d.density)
      ? d.density.toFixed(5)
      : '—';
  const isLeftSide = d.isLeft ?? xVal < cutoff;
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      fontSize: 13,
    }}>
      <p style={{ margin: 0, fontWeight: 700, color: '#043873' }}>
        {isLeftSide ? 'Below' : 'Above'} cutoff
      </p>
      <p style={{ margin: '4px 0 0', color: '#374151' }}>
        Running var ≈ {xVal.toFixed(3)}
      </p>
      <p style={{ margin: '2px 0 0', color: '#374151' }}>
        Density: <strong>{densityLabel}</strong>
      </p>
    </div>
  );
};

export const RDDensityChart: React.FC<RDDensityChartProps> = ({
  chartData,
  zStat,
  pValue,
  passed,
}) => {
  const {
    bins,
    leftCurve,
    rightCurve,
    cutoff,
    leftDensityAtCutoff,
    rightDensityAtCutoff,
    xAxisLabel,
    yAxisLabel,
    title,
  } = chartData;

  if (!bins || bins.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0', fontSize: 14 }}>
        No density data to display.
      </div>
    );
  }

  // Merge bins and curve points into a unified dataset keyed by x
  // (overlay two Line series for the fitted curves)
  const mergedMap = new Map<number, any>();
  for (const b of bins) {
    mergedMap.set(b.mid, { x: b.mid, density: b.density, isLeft: b.isLeft });
  }
  for (const p of leftCurve) {
    const existing = mergedMap.get(p.x) || {
      x: p.x,
      mid: p.x,
      isLeft: true,
    };
    existing.leftFit = p.y;
    mergedMap.set(p.x, existing);
  }
  for (const p of rightCurve) {
    const existing = mergedMap.get(p.x) || {
      x: p.x,
      mid: p.x,
      isLeft: false,
    };
    existing.rightFit = p.y;
    mergedMap.set(p.x, existing);
  }

  const chartPoints = Array.from(mergedMap.values()).sort((a, b) => a.x - b.x);

  const maxDensity = Math.max(...bins.map(b => b.density), leftDensityAtCutoff, rightDensityAtCutoff);

  return (
    <div style={{ width: '100%' }}>
      <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#043873', marginBottom: 8 }}>
        {title}
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={chartPoints}
          margin={{ top: 10, right: 24, left: 0, bottom: 32 }}
        >
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => v.toFixed(1)}
            label={{ value: xAxisLabel, position: 'insideBottom', offset: -18, fontSize: 12, fill: '#374151' }}
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          <YAxis
            domain={[0, maxDensity * 1.2]}
            tickFormatter={(v: number) => v.toFixed(4)}
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', offset: 16, fontSize: 12, fill: '#374151' }}
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          <Tooltip
            content={(props) => <CustomTooltip {...props} cutoff={cutoff} />}
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          />

          {/* Cutoff reference line */}
          <ReferenceLine
            x={cutoff}
            stroke={CUTOFF_COLOR}
            strokeWidth={2}
            strokeDasharray="5 3"
            label={{
              value: `Cutoff: ${cutoff}`,
              position: 'top',
              fill: CUTOFF_COLOR,
              fontSize: 11,
              fontWeight: 700,
            }}
          />

          {/* Histogram bars coloured by side */}
          <Bar dataKey="density" radius={[2, 2, 0, 0]} maxBarSize={40}>
            {chartPoints.map((entry, i) =>
              entry.density != null ? (
                <Cell
                  key={`cell-${i}`}
                  fill={(entry.isLeft ?? entry.x < cutoff) ? LEFT_COLOR : RIGHT_COLOR}
                  fillOpacity={0.45}
                />
              ) : null
            )}
          </Bar>

          {/* Left fitted curve */}
          <Line
            dataKey="leftFit"
            stroke={LEFT_COLOR}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />

          {/* Right fitted curve */}
          <Line
            dataKey="rightFit"
            stroke={RIGHT_COLOR}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Density-at-cutoff annotation */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 28,
        marginTop: 6,
        fontSize: 12,
        color: '#374151',
        flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 18, height: 3, background: LEFT_COLOR, display: 'inline-block', borderRadius: 2 }} />
          Left of cutoff (density at cutoff: {leftDensityAtCutoff.toFixed(4)})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 18, height: 3, background: RIGHT_COLOR, display: 'inline-block', borderRadius: 2 }} />
          Right of cutoff (density at cutoff: {rightDensityAtCutoff.toFixed(4)})
        </span>
        {zStat !== null && pValue !== null && (
          <span style={{ color: passed ? '#155724' : '#856404', fontWeight: 600 }}>
            {passed ? '✓' : '⚠'} Z = {zStat.toFixed(3)}, p = {pValue.toFixed(3)}
          </span>
        )}
      </div>
    </div>
  );
};

export default RDDensityChart;
