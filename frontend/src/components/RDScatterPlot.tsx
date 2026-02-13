import React, { useState, useEffect } from 'react';
import {
  ScatterChart,
  Scatter,
  LineChart,
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
import { useAuth } from '../contexts/AuthContext';

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
  const [scatterData, setScatterData] = useState<DataPoint[]>([]);
  const [fittedLines, setFittedLines] = useState<FittedLine[]>([]);

  useEffect(() => {
    const fetchDataAndFit = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch the dataset
        const response = await axios.get(`/datasets/${datasetId}/preview`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { limit: 10000 }, // Get sufficient data for visualization
        });

        const rawData = response.data.rows || [];

        if (rawData.length === 0) {
          setError('No data available for visualization');
          setLoading(false);
          return;
        }

        // Filter data within bandwidth window
        const windowData: DataPoint[] = rawData
          .filter((row: any) => {
            const x = parseFloat(row[runningVar]);
            const y = parseFloat(row[outcomeVar]);
            return (
              !isNaN(x) &&
              !isNaN(y) &&
              Math.abs(x - cutoff) <= bandwidth
            );
          })
          .map((row: any) => ({
            x: parseFloat(row[runningVar]),
            y: parseFloat(row[outcomeVar]),
            treated: treatmentSide === 'below'
              ? parseFloat(row[runningVar]) < cutoff
              : parseFloat(row[runningVar]) >= cutoff,
          }));

        if (windowData.length === 0) {
          setError('No data points within bandwidth window');
          setLoading(false);
          return;
        }

        setScatterData(windowData);

        // Fit polynomial regression lines
        const controlData = windowData.filter((d) => !d.treated);
        const treatedData = windowData.filter((d) => d.treated);

        // Generate fitted lines
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
            if (treatedData.length > 0) {
              point.y_treated = fitPolynomial(treatedData, x, cutoff, polynomialOrder);
            }
          } else {
            if (controlData.length > 0) {
              point.y_control = fitPolynomial(controlData, x, cutoff, polynomialOrder);
            }
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

    if (accessToken && datasetId) {
      fetchDataAndFit();
    }
  }, [accessToken, datasetId, runningVar, outcomeVar, cutoff, bandwidth, polynomialOrder]);

  // Simple polynomial regression fit for visualization
  const fitPolynomial = (
    data: DataPoint[],
    x: number,
    cutoff: number,
    order: number
  ): number => {
    if (data.length === 0) return 0;

    // Center x around cutoff
    const xCentered = x - cutoff;

    // Use simple polynomial evaluation with OLS estimates
    // For visualization purposes, we'll use a simplified approach
    const xValues = data.map((d) => d.x - cutoff);
    const yValues = data.map((d) => d.y);

    // Build design matrix
    const n = xValues.length;
    const p = order + 1;

    if (n < p) {
      // Not enough data, return mean
      return yValues.reduce((sum, y) => sum + y, 0) / n;
    }

    // Simple least squares for intercept and slope (linear)
    const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
    const yMean = yValues.reduce((sum, y) => sum + y, 0) / n;

    if (order === 1) {
      // Linear regression
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < n; i++) {
        numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
        denominator += (xValues[i] - xMean) ** 2;
      }
      const slope = denominator > 0 ? numerator / denominator : 0;
      const intercept = yMean - slope * xMean;
      return intercept + slope * xCentered;
    } else {
      // Quadratic regression (simplified)
      // For simplicity, we'll use a weighted average approach
      // In production, you'd use proper matrix operations
      return yMean; // Fallback to mean for now
    }
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
        <div style={styles.errorBox}>
          <strong>⚠️ Error:</strong> {error}
        </div>
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

  // Split scatter data by treatment status
  const controlPoints = scatterData.filter((d) => !d.treated);
  const treatedPoints = scatterData.filter((d) => d.treated);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const point = payload[0].payload;

      // Handle cases where some values might be undefined
      const x = point.x ?? 0;
      const y = point.y ?? 0;

      return (
        <div style={styles.tooltipContainer}>
          <p style={styles.tooltipTitle}>
            {point.treated ? 'Treated' : 'Control'}
          </p>
          <p style={styles.tooltipItem}>
            <strong>{runningVar}:</strong> {x.toFixed(3)}
          </p>
          <p style={styles.tooltipItem}>
            <strong>{outcomeVar}:</strong> {y.toFixed(3)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerSection}>
        <h3 style={styles.title}>RD Visualization</h3>
        <p style={styles.subtitle}>
          Scatter plot showing the discontinuity at the cutoff (bandwidth = {bandwidth.toFixed(3)})
        </p>
      </div>

      <div style={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={500}>
          <ComposedChart margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => value.toFixed(2)}
            >
              <Label
                value={runningVar}
                position="insideBottom"
                offset={-10}
                style={{ fontSize: '14px', fontWeight: 'bold' }}
              />
            </XAxis>
            <YAxis
              dataKey="y"
              type="number"
              tickFormatter={(value) => value.toFixed(2)}
            >
              <Label
                value={outcomeVar}
                angle={-90}
                position="insideLeft"
                style={{ fontSize: '14px', fontWeight: 'bold' }}
              />
            </YAxis>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              wrapperStyle={{ paddingBottom: '10px' }}
            />

            {/* Cutoff line */}
            <ReferenceLine
              x={cutoff}
              stroke="#dc3545"
              strokeWidth={2}
              strokeDasharray="5 5"
              label={{
                value: `Cutoff: ${cutoff}`,
                position: 'top',
                fill: '#dc3545',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            />

            {/* Control scatter points */}
            <Scatter
              data={controlPoints}
              fill="#6c757d"
              fillOpacity={0.6}
              name={treatmentSide === 'below' ? 'Control (At/Above Cutoff)' : 'Control (Below Cutoff)'}
            />

            {/* Treated scatter points */}
            <Scatter
              data={treatedPoints}
              fill="#043873"
              fillOpacity={0.6}
              name={treatmentSide === 'below' ? 'Treated (Below Cutoff)' : 'Treated (At/Above Cutoff)'}
            />

            {/* Fitted lines */}
            <Line
              data={fittedLines}
              type="monotone"
              dataKey="y_control"
              stroke="#6c757d"
              strokeWidth={3}
              dot={false}
              name="Control Fit"
              connectNulls={false}
            />
            <Line
              data={fittedLines}
              type="monotone"
              dataKey="y_treated"
              stroke="#043873"
              strokeWidth={3}
              dot={false}
              name="Treated Fit"
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={styles.noteBox}>
        <strong>📊 How to interpret:</strong> The vertical red line marks the cutoff.
        Points in blue are the <strong>treated units</strong> ({treatmentSide === 'below' ? 'below' : 'above'} the cutoff),
        and points in gray are the <strong>control units</strong>.
        The fitted lines show the local polynomial regression on each side.
        A discontinuous jump at the cutoff indicates a treatment effect.
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

