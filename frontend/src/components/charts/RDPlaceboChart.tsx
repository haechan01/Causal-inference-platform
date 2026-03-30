/**
 * RDPlaceboChart — dot-plot of RD estimates at fake cutoff values.
 *
 * X-axis: fake cutoff value
 * Y-axis: estimated treatment effect at that fake cutoff
 * Error bars: 95% confidence interval
 * Points coloured by significance; cutoff marked with a vertical line.
 */
import React from 'react';
import {
  ComposedChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ErrorBar,
} from 'recharts';

interface PlaceboEstimate {
  fake_cutoff: number;
  estimate: number;
  se: number;
  ci_lower: number;
  ci_upper: number;
  p_value: number;
  is_significant: boolean;
}

interface ChartData {
  placeboEstimates: PlaceboEstimate[];
  realCutoff: number;
  realEffect: number | null;
  pseudoPValue: number | null;
  xAxisLabel: string;
  yAxisLabel: string;
  title: string;
}

interface RDPlaceboChartProps {
  chartData: ChartData;
}

const BLUE       = '#4F9CF9';
const RED_SIG    = '#FF6B6B';
const REAL_COLOR = '#FF6B6B';
const GRID_COLOR = '#e5e7eb';

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  const fill = payload.is_significant ? RED_SIG : BLUE;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={fill}
      fillOpacity={payload.is_significant ? 0.9 : 0.65}
      stroke="white"
      strokeWidth={1.5}
    />
  );
};

const CustomTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d: PlaceboEstimate = payload[0]?.payload;
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
        Fake cutoff: {d.fake_cutoff.toFixed(3)}
      </p>
      <p style={{ margin: '4px 0 0', color: '#374151' }}>
        Effect: <strong>{d.estimate.toFixed(4)}</strong>
      </p>
      <p style={{ margin: '2px 0 0', color: '#374151' }}>
        95% CI: [{d.ci_lower.toFixed(3)}, {d.ci_upper.toFixed(3)}]
      </p>
      <p style={{ margin: '2px 0 0', color: '#374151' }}>
        p-value: <strong>{d.p_value.toFixed(3)}</strong>
      </p>
      {d.is_significant && (
        <p style={{ margin: '4px 0 0', color: RED_SIG, fontWeight: 600 }}>
          ⚠ Significant at 5%
        </p>
      )}
    </div>
  );
};

export const RDPlaceboChart: React.FC<RDPlaceboChartProps> = ({ chartData }) => {
  const { placeboEstimates, realCutoff, realEffect, xAxisLabel, yAxisLabel, title } = chartData;

  if (!placeboEstimates || placeboEstimates.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0', fontSize: 14 }}>
        No placebo data to display.
      </div>
    );
  }

  // Build scatter data with error bars
  const scatterData = placeboEstimates.map(e => ({
    ...e,
    errorY: [
      e.estimate - e.ci_lower,  // lower error (distance down)
      e.ci_upper - e.estimate,  // upper error (distance up)
    ],
  }));

  const allEffects = placeboEstimates.map(e => e.estimate);
  const allCIs = placeboEstimates.flatMap(e => [e.ci_lower, e.ci_upper]);
  if (realEffect !== null) allEffects.push(realEffect);
  const yMin = Math.min(...allCIs) * 1.15;
  const yMax = Math.max(...allCIs) * 1.15;

  return (
    <div style={{ width: '100%' }}>
      <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#043873', marginBottom: 8 }}>
        {title}
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={scatterData}
          margin={{ top: 10, right: 24, left: 0, bottom: 32 }}
        >
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
          <XAxis
            dataKey="fake_cutoff"
            type="number"
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => v.toFixed(1)}
            label={{ value: xAxisLabel, position: 'insideBottom', offset: -18, fontSize: 12, fill: '#374151' }}
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={(v: number) => v.toFixed(2)}
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', offset: 14, fontSize: 12, fill: '#374151' }}
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Zero line */}
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1.5} />

          {/* Cutoff vertical */}
          <ReferenceLine
            x={realCutoff}
            stroke={REAL_COLOR}
            strokeWidth={2.5}
            label={{
              value: `Cutoff: ${realCutoff}`,
              position: 'insideTop',
              offset: 12,
              fill: REAL_COLOR,
              fontSize: 11,
              fontWeight: 700,
            }}
          />

          {/* Real effect horizontal */}
          {realEffect !== null && (
            <ReferenceLine
              y={realEffect}
              stroke={REAL_COLOR}
              strokeDasharray="6 3"
              strokeWidth={1.5}
              label={{
                value: `Real effect: ${realEffect.toFixed(3)}`,
                position: 'right',
                fill: REAL_COLOR,
                fontSize: 10,
              }}
            />
          )}

          <Scatter dataKey="estimate" shape={<CustomDot />}>
            <ErrorBar dataKey="errorY" width={4} strokeWidth={1.5} stroke="#9ca3af" direction="y" />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 4, fontSize: 12, color: '#374151' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: BLUE, opacity: 0.65, borderRadius: '50%', display: 'inline-block' }} />
          Placebo effect (not significant)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: RED_SIG, borderRadius: '50%', display: 'inline-block' }} />
          Placebo effect (significant)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 22, height: 2, background: REAL_COLOR, display: 'inline-block' }} />
          Cutoff / effect
        </span>
      </div>
    </div>
  );
};

export default RDPlaceboChart;
