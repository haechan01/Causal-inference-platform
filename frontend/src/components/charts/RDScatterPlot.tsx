import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Label,
} from 'recharts';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

interface RDScatterPlotProps {
  datasetId: number;
  runningVar: string;
  outcomeVar: string;
  cutoff: number;
  bandwidth: number;
  polynomialOrder: number;
  treatmentSide?: 'above' | 'below';
}

interface DataPoint {
  x: number;
  y: number;
  treated: boolean;
}

interface FittedLine {
  x: number;
  y_control?: number;
  y_treated?: number;
}

// ── Small reusable inline-editable label ────────────────────────────────────
const EditableLabel: React.FC<{
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}> = ({ value, onChange, style, inputStyle }) => {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(false); }}
        style={{
          border: 'none',
          borderBottom: '2px solid #4F9CF9',
          background: 'transparent',
          outline: 'none',
          textAlign: 'center',
          padding: '2px 4px',
          fontFamily: 'inherit',
          ...inputStyle,
        }}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{ cursor: 'text', borderBottom: '1px dashed #b3d0ff', paddingBottom: '1px', ...style }}
    >
      {value}
    </span>
  );
};

// ── Download button ──────────────────────────────────────────────────────────
const DownloadButton: React.FC<{ chartRef: React.RefObject<HTMLDivElement | null>; filename: string }> = ({ chartRef, filename }) => {
  const handleDownload = useCallback(async () => {
    if (!chartRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartRef.current, { scale: 2, useCORS: true } as any);
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Chart download failed:', err);
    }
  }, [chartRef, filename]);

  return (
    <button
      onClick={handleDownload}
      title="Download chart as PNG"
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '7px 14px', borderRadius: '8px',
        border: '1px solid #d0dff5', background: '#f0f7ff',
        color: '#043873', fontSize: '13px', fontWeight: 600,
        cursor: 'pointer', flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#dceeff')}
      onMouseLeave={e => (e.currentTarget.style.background = '#f0f7ff')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Download PNG
    </button>
  );
};

const RDScatterPlot: React.FC<RDScatterPlotProps> = ({
  datasetId,
  runningVar,
  outcomeVar,
  cutoff,
  bandwidth,
  polynomialOrder,
  treatmentSide = 'above',
}) => {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allData, setAllData] = useState<DataPoint[]>([]);
  const [scatterData, setScatterData] = useState<DataPoint[]>([]);
  const [fittedLines, setFittedLines] = useState<FittedLine[]>([]);
  const [activeView, setActiveView] = useState<'all' | 'bandwidth'>('bandwidth');

  // Editable label state
  const [chartTitle, setChartTitle] = useState('RD Visualization');
  const [xLabel, setXLabel] = useState(runningVar);
  const [yLabel, setYLabel] = useState(outcomeVar);
  const chartRef = useRef<HTMLDivElement>(null);

  // Keep x/y labels in sync when props change (e.g. first load)
  useEffect(() => { setXLabel(runningVar); }, [runningVar]);
  useEffect(() => { setYLabel(outcomeVar); }, [outcomeVar]);

  useEffect(() => {
    const fetchDataAndFit = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await axios.get(`/datasets/${datasetId}/preview`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { limit: 10000 },
        });

        const rawData = response.data.rows || [];

        if (rawData.length === 0) {
          setError('No data available for visualization');
          setLoading(false);
          return;
        }

        const toPoint = (row: any): DataPoint | null => {
          const x = parseFloat(row[runningVar]);
          const y = parseFloat(row[outcomeVar]);
          if (isNaN(x) || isNaN(y)) return null;
          return {
            x,
            y,
            treated: treatmentSide === 'below' ? x < cutoff : x >= cutoff,
          };
        };

        const all: DataPoint[] = rawData.map(toPoint).filter(Boolean) as DataPoint[];
        const windowData: DataPoint[] = all.filter(d => Math.abs(d.x - cutoff) <= bandwidth);

        if (all.length === 0) {
          setError('No valid numeric data found');
          setLoading(false);
          return;
        }

        if (windowData.length === 0) {
          setError('No data points within bandwidth window');
          setLoading(false);
          return;
        }

        setAllData(all);
        setScatterData(windowData);

        const controlData = windowData.filter(d => !d.treated);
        const treatedData = windowData.filter(d => d.treated);

        const numPoints = 50;
        const xMin = cutoff - bandwidth;
        const xMax = cutoff + bandwidth;
        const xStep = (xMax - xMin) / (numPoints - 1);
        const fitted: FittedLine[] = [];

        for (let i = 0; i < numPoints; i++) {
          const x = xMin + i * xStep;
          const point: FittedLine = { x };
          const isLeftOfCutoff = x < cutoff;
          const isTreatedSide = treatmentSide === 'below' ? isLeftOfCutoff : !isLeftOfCutoff;

          if (isTreatedSide) {
            if (treatedData.length > 0)
              point.y_treated = fitPolynomial(treatedData, x, cutoff, polynomialOrder);
          } else {
            if (controlData.length > 0)
              point.y_control = fitPolynomial(controlData, x, cutoff, polynomialOrder);
          }
          fitted.push(point);
        }

        setFittedLines(fitted);
      } catch (err: any) {
        console.error('Error fetching RD scatter data:', err);
        setError(err.response?.data?.error || 'Failed to load scatter plot data');
      } finally {
        setLoading(false);
      }
    };

    if (accessToken && datasetId) fetchDataAndFit();
  }, [accessToken, datasetId, runningVar, outcomeVar, cutoff, bandwidth, polynomialOrder, treatmentSide]);

  const fitPolynomial = (data: DataPoint[], x: number, cutoff: number, order: number): number => {
    if (data.length === 0) return 0;
    const xCentered = x - cutoff;
    const xValues = data.map(d => d.x - cutoff);
    const yValues = data.map(d => d.y);
    const n = xValues.length;
    const p = order + 1;

    if (n < p) return yValues.reduce((s, y) => s + y, 0) / n;

    const xMean = xValues.reduce((s, x) => s + x, 0) / n;
    const yMean = yValues.reduce((s, y) => s + y, 0) / n;

    if (order === 1) {
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (xValues[i] - xMean) * (yValues[i] - yMean);
        den += (xValues[i] - xMean) ** 2;
      }
      const slope = den > 0 ? num / den : 0;
      const intercept = yMean - slope * xMean;
      return intercept + slope * xCentered;
    }
    return yMean;
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>RD Visualization</h3>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
          <p style={styles.loadingText}>Loading scatter plot...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>RD Visualization</h3>
        <div style={styles.errorBox}><strong>⚠️ Error:</strong> {error}</div>
      </div>
    );
  }

  if (scatterData.length === 0) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>RD Visualization</h3>
        <p style={styles.noDataText}>No data available for visualization.</p>
      </div>
    );
  }

  const displayData = activeView === 'all' ? allData : scatterData;
  const controlPoints = displayData.filter(d => !d.treated);
  const treatedPoints = displayData.filter(d => d.treated);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const point = payload[0].payload;
      const x = point.x ?? 0;
      const y = point.y ?? 0;
      return (
        <div style={styles.tooltipContainer}>
          <p style={styles.tooltipTitle}>{point.treated ? 'Treated' : 'Control'}</p>
          <p style={styles.tooltipItem}><strong>{runningVar}:</strong> {x.toFixed(3)}</p>
          <p style={styles.tooltipItem}><strong>{outcomeVar}:</strong> {y.toFixed(3)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={styles.container}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={styles.headerSection}>
          <h3 style={styles.title}>
            <EditableLabel
              value={chartTitle}
              onChange={setChartTitle}
              style={{ fontSize: '20px', fontWeight: 700, color: '#333' }}
              inputStyle={{ fontSize: '20px', fontWeight: 700, color: '#333', width: '260px' }}
            />
          </h3>
          <p style={styles.subtitle}>
            {activeView === 'bandwidth'
              ? <>Bandwidth window [{(cutoff - bandwidth).toFixed(3)}, {(cutoff + bandwidth).toFixed(3)}] &nbsp;
                  <span style={{ fontWeight: 600, color: '#e67e22' }}>Bandwidth = {bandwidth.toFixed(3)}</span>
                </>
              : <>{allData.length.toLocaleString()} observations &nbsp;·&nbsp;
                  <span style={{ color: '#e67e22', fontWeight: 600 }}>{scatterData.length}</span> within bandwidth
                </>
            }
          </p>
        </div>
        <DownloadButton chartRef={chartRef} filename="rd_scatter_plot.png" />
      </div>

      {/* View tabs */}
      <div style={styles.tabRow}>
        {(['bandwidth', 'all'] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            style={{
              ...styles.tab,
              ...(activeView === view ? styles.tabActive : styles.tabInactive),
            }}
          >
            {view === 'bandwidth' ? 'Bandwidth View' : 'All Data'}
          </button>
        ))}
      </div>

      {/* Capturable chart area */}
      <div ref={chartRef} style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #f0f0f0' }}>
        <div style={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={500}>
            <ComposedChart margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => v.toFixed(2)}>
                <Label value={xLabel} position="insideBottom" offset={-10} style={{ fontSize: '14px', fontWeight: 'bold' }} />
              </XAxis>
              <YAxis dataKey="y" type="number" tickFormatter={v => v.toFixed(2)}>
                <Label value={yLabel} angle={-90} position="insideLeft" style={{ fontSize: '14px', fontWeight: 'bold' }} />
              </YAxis>
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ paddingBottom: '10px' }} />

              {/* Bandwidth reference lines — always shown */}
              <ReferenceLine x={cutoff - bandwidth} stroke="#e67e22" strokeWidth={1.5} strokeDasharray="4 4"
                label={{ value: `−Bandwidth`, position: 'insideTopRight', fill: '#e67e22', fontSize: 11 }} />
              <ReferenceLine x={cutoff + bandwidth} stroke="#e67e22" strokeWidth={1.5} strokeDasharray="4 4"
                label={{ value: `+Bandwidth`, position: 'insideTopLeft', fill: '#e67e22', fontSize: 11 }} />
              <ReferenceLine x={cutoff} stroke="#dc3545" strokeWidth={2} strokeDasharray="5 5"
                label={{ value: `Cutoff: ${cutoff}`, position: 'top', fill: '#dc3545', fontSize: 12, fontWeight: 'bold' }} />

              <Scatter
                data={controlPoints}
                fill="#6c757d"
                fillOpacity={0.6}
                name={activeView === 'all'
                  ? 'Control'
                  : treatmentSide === 'below' ? 'Control (At/Above Cutoff)' : 'Control (Below Cutoff)'}
              />
              <Scatter
                data={treatedPoints}
                fill="#043873"
                fillOpacity={0.6}
                name={activeView === 'all'
                  ? 'Treated'
                  : treatmentSide === 'below' ? 'Treated (Below Cutoff)' : 'Treated (At/Above Cutoff)'}
              />

              {/* Fitted lines — only in bandwidth view */}
              {activeView === 'bandwidth' && (
                <>
                  <Line data={fittedLines} type="monotone" dataKey="y_control" stroke="#6c757d"
                    strokeWidth={3} dot={false} name="Control Fit" connectNulls={false} />
                  <Line data={fittedLines} type="monotone" dataKey="y_treated" stroke="#043873"
                    strokeWidth={3} dot={false} name="Treated Fit" connectNulls={false} />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Editable axis label controls */}
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#555', display: 'flex', alignItems: 'center', gap: '6px' }}>
            X-axis:
            <EditableLabel value={xLabel} onChange={setXLabel}
              style={{ fontSize: '12px', color: '#333', fontWeight: 500 }}
              inputStyle={{ fontSize: '12px', color: '#333', width: '120px' }} />
          </span>
          <span style={{ fontSize: '12px', color: '#555', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Y-axis:
            <EditableLabel value={yLabel} onChange={setYLabel}
              style={{ fontSize: '12px', color: '#333', fontWeight: 500 }}
              inputStyle={{ fontSize: '12px', color: '#333', width: '120px' }} />
          </span>
          <span style={{ fontSize: '12px', color: '#555', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Title:
            <EditableLabel value={chartTitle} onChange={setChartTitle}
              style={{ fontSize: '12px', color: '#333', fontWeight: 500 }}
              inputStyle={{ fontSize: '12px', color: '#333', width: '160px' }} />
          </span>
        </div>
        <p style={{ textAlign: 'center', fontSize: '11px', color: '#888', marginTop: '6px' }}>
          Click any label above to edit &nbsp;·&nbsp; Generated by Causal Platform
        </p>
      </div>

      <div style={{ ...styles.noteBox, marginTop: '16px' }}>
        {activeView === 'bandwidth' ? (
          <><strong>Bandwidth view:</strong> Only observations within ±{bandwidth.toFixed(3)} of the cutoff are shown.
            The <span style={{ color: '#dc3545', fontWeight: 600 }}>red dashed line</span> marks the cutoff.
            Fitted lines show the local polynomial regression on each side. A jump at the cutoff indicates a treatment effect.</>
        ) : (
          <><strong>All data view:</strong> All {allData.length.toLocaleString()} observations are shown.
            The <span style={{ color: '#e67e22', fontWeight: 600 }}>orange dashed lines</span> mark the bandwidth boundary (±{bandwidth.toFixed(3)}) —
            only observations between these lines are used for estimation.</>
        )}
      </div>
    </div>
  );
};

export default RDScatterPlot;

const styles = {
  container: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    marginBottom: '30px',
  },
  headerSection: {
    marginBottom: '0',
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold' as const,
    color: '#333',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  loadingSpinner: {
    width: '30px',
    height: '30px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '15px',
  },
  loadingText: { fontSize: '14px', color: '#666', margin: 0 },
  errorBox: {
    padding: '15px',
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    borderRadius: '8px',
    color: '#c33',
    fontSize: '14px',
  },
  noDataText: { textAlign: 'center' as const, color: '#666', padding: '20px', fontSize: '14px' },
  chartContainer: { marginTop: '0', marginBottom: '0' },
  tooltipContainer: {
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  tooltipTitle: { fontSize: '14px', fontWeight: 'bold' as const, color: '#043873', margin: '0 0 8px 0' },
  tooltipItem: { fontSize: '13px', color: '#333', margin: '4px 0' },
  noteBox: {
    backgroundColor: '#e7f3ff',
    border: '1px solid #b3d9ff',
    borderRadius: '8px',
    padding: '15px',
    fontSize: '13px',
    color: '#004085',
    lineHeight: '1.5',
  },
  tabRow: {
    display: 'flex',
    gap: '6px',
    marginBottom: '16px',
  },
  tab: {
    padding: '7px 18px',
    borderRadius: '8px',
    border: '1px solid #d0dff5',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: '#043873',
    color: '#fff',
    border: '1px solid #043873',
  },
  tabInactive: {
    background: '#f0f7ff',
    color: '#043873',
  },
};
