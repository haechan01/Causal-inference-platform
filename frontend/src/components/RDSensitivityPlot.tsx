import React, { useState, useEffect } from 'react';
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
import { useAuth } from '../contexts/AuthContext';

interface RDSensitivityPlotProps {
  datasetId: number;
  runningVar: string;
  outcomeVar: string;
  cutoff: number;
  optimalBandwidth?: number;
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

const RDSensitivityPlot: React.FC<RDSensitivityPlotProps> = ({
  datasetId,
  runningVar,
  outcomeVar,
  cutoff,
  optimalBandwidth,
  treatmentSide = 'above',
}) => {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SensitivityResult[]>([]);
  const [stabilityCoefficient, setStabilityCoefficient] = useState<number | null>(null);
  const [stabilityStd, setStabilityStd] = useState<number | null>(null);
  const [interpretation, setInterpretation] = useState<any>(null);

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
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        const results = response.data.results || [];
        // Filter out any results with undefined/null treatment effects
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

    if (accessToken && datasetId) {
      fetchSensitivityAnalysis();
    }
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
        <div style={styles.errorBox}>
          <strong>⚠️ Error:</strong> {error}
        </div>
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

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const point = payload[0].payload;

      // Handle cases where some values might be undefined
      const bandwidth = point.bandwidth ?? 0;
      const effect = point.treatment_effect ?? 0;
      const ciLower = point.ci_lower ?? 0;
      const ciUpper = point.ci_upper ?? 0;
      const pValue = point.p_value ?? 0;
      const nTotal = point.n_total ?? 0;

      return (
        <div style={styles.tooltipContainer}>
          <p style={styles.tooltipTitle}>Bandwidth: {bandwidth.toFixed(3)}</p>
          <p style={styles.tooltipItem}>
            <strong>Effect:</strong> {effect.toFixed(3)}
          </p>
          <p style={styles.tooltipItem}>
            <strong>95% CI:</strong> [{ciLower.toFixed(3)}, {ciUpper.toFixed(3)}]
          </p>
          <p style={styles.tooltipItem}>
            <strong>P-value:</strong> {pValue.toFixed(4)}
          </p>
          <p style={styles.tooltipItem}>
            <strong>Sample:</strong> {nTotal}
          </p>
        </div>
      );
    }
    return null;
  };

  // Determine stability color
  const getStabilityColor = (stability: string) => {
    switch (stability) {
      case 'highly_stable':
        return '#28a745';
      case 'stable':
        return '#28a745';
      case 'moderately_stable':
        return '#ffc107';
      case 'unstable':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const stabilityColor = interpretation
    ? getStabilityColor(interpretation.stability)
    : '#6c757d';

  return (
    <div style={styles.container}>
      <div style={styles.headerSection}>
        <h3 style={styles.title}>Sensitivity Analysis</h3>
        <p style={styles.subtitle}>
          How the treatment effect varies across different bandwidth choices
        </p>
      </div>

      {/* Stability Metrics */}
      {interpretation && (
        <div style={styles.stabilityCard}>
          <div style={styles.stabilityHeader}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              {stabilityCoefficient !== null && (
                <div>
                  <span style={styles.stabilityLabel}>Stability Coefficient (CV):</span>
                  <span style={styles.stabilityValue}>
                    {(stabilityCoefficient * 100).toFixed(2)}%
                  </span>
                </div>
              )}
              {stabilityStd !== null && stabilityCoefficient === null && (
                <div>
                  <span style={styles.stabilityLabel}>Standard Deviation:</span>
                  <span style={styles.stabilityValue}>
                    {stabilityStd.toFixed(3)}
                  </span>
                </div>
              )}
            </div>
            <div
              style={{
                ...styles.stabilityBadge,
                backgroundColor: stabilityColor,
                marginLeft: 'auto',
              }}
            >
              {interpretation.stability.replace(/_/g, ' ').toUpperCase()}
            </div>
          </div>
          <p style={styles.stabilityInterpretation}>
            {interpretation.message}
          </p>
        </div>
      )}

      {/* Chart */}
      <div style={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="bandwidth"
              label={{ value: 'Bandwidth', position: 'insideBottom', offset: -10 }}
              tickFormatter={(value) => value.toFixed(2)}
            />
            <YAxis
              label={{ value: 'Treatment Effect', angle: -90, position: 'insideLeft' }}
              tickFormatter={(value) => value.toFixed(2)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '40px' }} />

            {/* Confidence interval area */}
            <Area
              type="monotone"
              dataKey="ci_upper"
              stroke="none"
              fill="#043873"
              fillOpacity={0.1}
              name="95% CI Upper"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="ci_lower"
              stroke="none"
              fill="#043873"
              fillOpacity={0.1}
              name="95% CI Lower"
              legendType="none"
            />

            {/* Treatment effect line */}
            <Line
              type="monotone"
              dataKey="treatment_effect"
              stroke="#043873"
              strokeWidth={3}
              dot={{ fill: '#043873', r: 4 }}
              activeDot={{ r: 6 }}
              name="Treatment Effect"
            />

            {/* CI bounds */}
            <Line
              type="monotone"
              dataKey="ci_upper"
              stroke="#043873"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="95% CI Upper"
            />
            <Line
              type="monotone"
              dataKey="ci_lower"
              stroke="#043873"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="95% CI Lower"
            />

            {/* Zero reference line */}
            <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />

            {/* Optimal bandwidth reference line */}
            {optimalBandwidth && (
              <ReferenceLine
                x={optimalBandwidth}
                stroke="#28a745"
                strokeWidth={2}
                strokeDasharray="5 5"
                label={{
                  value: 'Optimal',
                  position: 'top',
                  fill: '#28a745',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Interpretation Note */}
      <div style={styles.noteBox}>
        <strong>📊 How to interpret:</strong> A stable treatment effect across bandwidths
        suggests robust results. Large variations may indicate sensitivity to bandwidth
        choice or model misspecification.
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
    marginBottom: '20px',
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
  loadingText: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  errorBox: {
    padding: '15px',
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    borderRadius: '8px',
    color: '#c33',
    fontSize: '14px',
  },
  noDataText: {
    textAlign: 'center' as const,
    color: '#666',
    padding: '20px',
    fontSize: '14px',
  },
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
  stabilityLabel: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500' as const,
    marginRight: '10px',
  },
  stabilityValue: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    color: '#043873',
  },
  stabilityBadge: {
    padding: '6px 12px',
    borderRadius: '6px',
    color: 'white',
    fontSize: '12px',
    fontWeight: 'bold' as const,
  },
  stabilityInterpretation: {
    fontSize: '14px',
    color: '#555',
    margin: 0,
    lineHeight: '1.5',
  },
  chartContainer: {
    marginTop: '20px',
    marginBottom: '20px',
  },
  tooltipContainer: {
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  tooltipTitle: {
    fontSize: '14px',
    fontWeight: 'bold' as const,
    color: '#043873',
    margin: '0 0 8px 0',
  },
  tooltipItem: {
    fontSize: '13px',
    color: '#333',
    margin: '4px 0',
  },
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

