import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

interface RDSensitivityPlotProps {
  datasetId: number;
  runningVar: string;
  outcomeVar: string;
  cutoff: number;
  optimalBandwidth?: number;
  selectedBandwidth?: number;
  treatmentSide?: 'above' | 'below';
}

interface SensitivityResult {
  bandwidth: number;
  treatment_effect: number;
  se: number;
  ci_lower: number;
  ci_upper: number;
  p_value: number;
  n_total: number;
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

const RDSensitivityPlot: React.FC<RDSensitivityPlotProps> = ({
  datasetId,
  runningVar,
  outcomeVar,
  cutoff,
  optimalBandwidth,
  selectedBandwidth,
  treatmentSide = 'above',
}) => {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SensitivityResult[]>([]);
  const [stabilityCoefficient, setStabilityCoefficient] = useState<number | null>(null);
  const [stabilityStd, setStabilityStd] = useState<number | null>(null);
  const [interpretation, setInterpretation] = useState<any>(null);

  // Editable label state
  const [chartTitle, setChartTitle] = useState('Bandwidth Sensitivity Analysis');
  const [xLabel, setXLabel] = useState('Bandwidth');
  const [yLabel, setYLabel] = useState('Treatment Effect');
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSensitivityAnalysis = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await axios.post(
          `/datasets/${datasetId}/analyze/rd/sensitivity`,
          {
            running_var: runningVar,
            outcome_var: outcomeVar,
            cutoff: cutoff,
            treatment_side: treatmentSide,
            n_bandwidths: 20,
          },
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const results = response.data.results || [];
        const validResults = results.filter(
          (r: any) => r.treatment_effect !== null && r.treatment_effect !== undefined
        );
        setData(validResults);
        setStabilityCoefficient(response.data.stability_coefficient);
        setStabilityStd(response.data.stability_std);
        setInterpretation(response.data.interpretation);
      } catch (err: any) {
        console.error('Error fetching sensitivity analysis:', err);
        setError(err.response?.data?.error || 'Failed to load sensitivity analysis');
      } finally {
        setLoading(false);
      }
    };

    if (accessToken && datasetId) fetchSensitivityAnalysis();
  }, [accessToken, datasetId, runningVar, outcomeVar, cutoff, treatmentSide]);

  if (loading) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Sensitivity Analysis</h3>
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
          <p style={styles.loadingText}>Running sensitivity analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Sensitivity Analysis</h3>
        <div style={styles.errorBox}><strong>⚠️ Error:</strong> {error}</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Sensitivity Analysis</h3>
        <p style={styles.noDataText}>No sensitivity data available.</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const point = payload[0].payload;
      const bandwidth = point.bandwidth ?? 0;
      const effect = point.treatment_effect ?? 0;
      const ciLower = point.ci_lower ?? 0;
      const ciUpper = point.ci_upper ?? 0;
      const pValue = point.p_value ?? 0;
      const nTotal = point.n_total ?? 0;
      return (
        <div style={styles.tooltipContainer}>
          <p style={styles.tooltipTitle}>Bandwidth: {bandwidth.toFixed(3)}</p>
          <p style={styles.tooltipItem}><strong>Effect:</strong> {effect.toFixed(3)}</p>
          <p style={styles.tooltipItem}><strong>95% CI:</strong> [{ciLower.toFixed(3)}, {ciUpper.toFixed(3)}]</p>
          <p style={styles.tooltipItem}><strong>P-value:</strong> {pValue.toFixed(4)}</p>
          <p style={styles.tooltipItem}><strong>Sample:</strong> {nTotal}</p>
        </div>
      );
    }
    return null;
  };

  const getStabilityColor = (stability: string) => {
    switch (stability) {
      case 'highly_stable': return '#28a745';
      case 'stable': return '#28a745';
      case 'moderately_stable': return '#ffc107';
      case 'unstable': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const stabilityColor = interpretation ? getStabilityColor(interpretation.stability) : '#6c757d';

  return (
    <div style={styles.container}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={styles.headerSection}>
          <h3 style={styles.title}>
            <EditableLabel
              value={chartTitle}
              onChange={setChartTitle}
              style={{ fontSize: '20px', fontWeight: 700, color: '#333' }}
              inputStyle={{ fontSize: '20px', fontWeight: 700, color: '#333', width: '280px' }}
            />
          </h3>
          <p style={styles.subtitle}>
            How the treatment effect varies across different bandwidth choices
          </p>
        </div>
        <DownloadButton chartRef={chartRef} filename="rd_sensitivity_plot.png" />
      </div>

      {/* Stability Metrics */}
      {interpretation && (
        <div style={styles.stabilityCard}>
          <div style={styles.stabilityHeader}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              {stabilityCoefficient !== null && (
                <div>
                  <span style={styles.stabilityLabel}>Stability Coefficient (CV):</span>
                  <span style={styles.stabilityValue}>{(stabilityCoefficient * 100).toFixed(2)}%</span>
                </div>
              )}
              {stabilityStd !== null && stabilityCoefficient === null && (
                <div>
                  <span style={styles.stabilityLabel}>Standard Deviation:</span>
                  <span style={styles.stabilityValue}>{stabilityStd.toFixed(3)}</span>
                </div>
              )}
            </div>
            <div style={{ ...styles.stabilityBadge, backgroundColor: stabilityColor, marginLeft: 'auto' }}>
              {interpretation.stability.replace(/_/g, ' ').toUpperCase()}
            </div>
          </div>
          <p style={styles.stabilityInterpretation}>{interpretation.message}</p>
        </div>
      )}

      {/* Capturable chart area */}
      <div ref={chartRef} style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #f0f0f0' }}>
        <div style={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis
                dataKey="bandwidth"
                label={{ value: xLabel, position: 'insideBottom', offset: -10 }}
                tickFormatter={v => v.toFixed(2)}
              />
              <YAxis
                label={{ value: yLabel, angle: -90, position: 'insideLeft' }}
                tickFormatter={v => v.toFixed(2)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '40px' }} />

              <Area type="monotone" dataKey="ci_upper" stroke="none" fill="#043873"
                fillOpacity={0.1} name="95% CI Upper" legendType="none" />
              <Area type="monotone" dataKey="ci_lower" stroke="none" fill="#043873"
                fillOpacity={0.1} name="95% CI Lower" legendType="none" />

              <Line type="monotone" dataKey="treatment_effect" stroke="#043873" strokeWidth={3}
                dot={{ fill: '#043873', r: 4 }} activeDot={{ r: 6 }} name="Treatment Effect" />
              <Line type="monotone" dataKey="ci_upper" stroke="#043873" strokeWidth={1}
                strokeDasharray="5 5" dot={false} name="95% CI Upper" />
              <Line type="monotone" dataKey="ci_lower" stroke="#043873" strokeWidth={1}
                strokeDasharray="5 5" dot={false} name="95% CI Lower" />

              <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />

              {selectedBandwidth && (
                <ReferenceLine x={selectedBandwidth} stroke="#e67e22" strokeWidth={2.5}
                  label={{ value: `Selected: ${selectedBandwidth.toFixed(3)}`, position: 'insideTopRight', fill: '#e67e22', fontSize: 12, fontWeight: 'bold' }} />
              )}
              {optimalBandwidth && (
                <ReferenceLine x={optimalBandwidth} stroke="#28a745" strokeWidth={2} strokeDasharray="5 5"
                  label={{ value: `Optimal: ${optimalBandwidth.toFixed(3)}`, position: 'insideTopLeft', fill: '#28a745', fontSize: 12, fontWeight: 'bold' }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Editable axis label controls */}
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: '#aaa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            X-axis:
            <EditableLabel value={xLabel} onChange={setXLabel}
              style={{ fontSize: '11px', color: '#888' }}
              inputStyle={{ fontSize: '11px', color: '#888', width: '100px' }} />
          </span>
          <span style={{ fontSize: '11px', color: '#aaa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Y-axis:
            <EditableLabel value={yLabel} onChange={setYLabel}
              style={{ fontSize: '11px', color: '#888' }}
              inputStyle={{ fontSize: '11px', color: '#888', width: '120px' }} />
          </span>
          <span style={{ fontSize: '11px', color: '#aaa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Title:
            <EditableLabel value={chartTitle} onChange={setChartTitle}
              style={{ fontSize: '11px', color: '#888' }}
              inputStyle={{ fontSize: '11px', color: '#888', width: '180px' }} />
          </span>
        </div>
        <p style={{ textAlign: 'center', fontSize: '10px', color: '#ccc', marginTop: '6px' }}>
          Click any label above to edit &nbsp;·&nbsp; Generated by Causal Platform
        </p>
      </div>

      <div style={{ ...styles.noteBox, marginTop: '16px' }}>
        <strong>How to interpret:</strong> Each point shows the estimated treatment effect
        for a given bandwidth. The <span style={{ color: '#e67e22', fontWeight: 600 }}>orange line</span> marks
        the bandwidth used in your analysis{selectedBandwidth ? ` (${selectedBandwidth.toFixed(3)})` : ''}.
        {optimalBandwidth && <> The <span style={{ color: '#28a745', fontWeight: 600 }}>green dashed line</span> is
        the algorithmically optimal bandwidth ({optimalBandwidth.toFixed(3)}).</>}{' '}
        A stable treatment effect across bandwidths suggests robust results; large variations may
        indicate sensitivity to bandwidth choice.
      </div>
    </div>
  );
};

export default RDSensitivityPlot;

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
  stabilityCard: {
    backgroundColor: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
  },
  stabilityHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
    gap: '10px',
  },
  stabilityLabel: { fontSize: '14px', color: '#666', fontWeight: '500' as const, marginRight: '10px' },
  stabilityValue: { fontSize: '18px', fontWeight: 'bold' as const, color: '#043873' },
  stabilityBadge: {
    padding: '6px 12px', borderRadius: '6px', color: 'white',
    fontSize: '12px', fontWeight: 'bold' as const,
  },
  stabilityInterpretation: { fontSize: '14px', color: '#555', margin: 0, lineHeight: '1.5' },
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
};
