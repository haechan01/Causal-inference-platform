import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface PlaceboChartData {
  placeboEstimates: number[];
  realEstimate: number | null;
  pseudoPValue: number | null;
  xAxisLabel: string;
  yAxisLabel: string;
  title: string;
  realLabel: string;
  placeboLabel: string;
}

interface PlaceboTestChartProps {
  chartData: PlaceboChartData;
}

interface BinData {
  binLabel: string;
  binMid: number;
  count: number;
  containsReal: boolean;
}

const BLUE = '#4F9CF9';
const HIGHLIGHT = '#FF6B6B';
const GRID_COLOR = '#e5e7eb';

function buildHistogram(values: number[], realEstimate: number | null, numBins = 10): BinData[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const binWidth = range / numBins;

  const bins: BinData[] = Array.from({ length: numBins }, (_, i) => {
    const lo = min + i * binWidth;
    const hi = lo + binWidth;
    const binMid = (lo + hi) / 2;
    return {
      binLabel: binMid.toFixed(2),
      binMid,
      count: 0,
      containsReal: realEstimate !== null && realEstimate >= lo && realEstimate < hi,
    };
  });

  // last bin is inclusive on right
  if (bins.length > 0) {
    bins[bins.length - 1].containsReal =
      realEstimate !== null &&
      realEstimate >= min + (numBins - 1) * binWidth;
  }

  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binWidth), numBins - 1);
    bins[idx].count += 1;
  }

  return bins;
}

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const data: BinData = payload[0]?.payload;
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      fontSize: 13,
    }}>
      <p style={{ margin: 0, fontWeight: 600, color: '#043873' }}>
        Effect ≈ {data.binMid.toFixed(3)}
      </p>
      <p style={{ margin: '4px 0 0', color: '#374151' }}>
        Count: <strong>{data.count}</strong>
      </p>
      {data.containsReal && (
        <p style={{ margin: '4px 0 0', color: HIGHLIGHT, fontWeight: 600 }}>
          ← Real estimate falls here
        </p>
      )}
    </div>
  );
};

export const PlaceboTestChart: React.FC<PlaceboTestChartProps> = ({ chartData }) => {
  const { placeboEstimates, realEstimate, xAxisLabel, yAxisLabel, title } = chartData;

  const bins = useMemo(
    () => buildHistogram(placeboEstimates, realEstimate),
    [placeboEstimates, realEstimate]
  );

  if (bins.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0', fontSize: 14 }}>
        No placebo data to display.
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#043873', marginBottom: 8 }}>
        {title}
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={bins}
          margin={{ top: 8, right: 20, left: 0, bottom: 30 }}
          barCategoryGap="2%"
        >
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="binMid"
            type="number"
            domain={[
              (dataMin: number) => parseFloat((dataMin - Math.abs(dataMin) * 0.1).toFixed(2)),
              (dataMax: number) => parseFloat((dataMax + Math.abs(dataMax) * 0.1).toFixed(2)),
            ]}
            tickFormatter={(v: number) => v.toFixed(1)}
            label={{ value: xAxisLabel, position: 'insideBottom', offset: -16, fontSize: 12, fill: '#374151' }}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickCount={6}
          />
          <YAxis
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', offset: 12, fontSize: 12, fill: '#374151' }}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(79,156,249,0.08)' }} />

          {/* Zero reference */}
          <ReferenceLine x={0} stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1.5} />

          {/* Real estimate reference */}
          {realEstimate !== null && (
            <ReferenceLine
              x={realEstimate}
              stroke={HIGHLIGHT}
              strokeWidth={2.5}
              label={{
                value: `Real: ${realEstimate.toFixed(2)}`,
                position: realEstimate >= 0 ? 'insideTopRight' : 'insideTopLeft',
                fill: HIGHLIGHT,
                fontSize: 12,
                fontWeight: 700,
              }}
            />
          )}

          <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={60}>
            {bins.map((entry, i) => (
              <Cell
                key={`cell-${i}`}
                fill={entry.containsReal ? HIGHLIGHT : BLUE}
                fillOpacity={entry.containsReal ? 1 : 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 4, fontSize: 12, color: '#374151' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 14, background: BLUE, opacity: 0.7, borderRadius: 3, display: 'inline-block' }} />
          Placebo estimates
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 14, background: HIGHLIGHT, borderRadius: 3, display: 'inline-block' }} />
          Real treatment effect
        </span>
      </div>
    </div>
  );
};

export default PlaceboTestChart;
