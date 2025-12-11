import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ErrorBar
} from 'recharts';

interface DataPoint {
  relativeTime: number;
  coefficient: number;
  ciLower: number;
  ciUpper: number;
  isReference: boolean;
  isPreTreatment: boolean;
}

interface ChartData {
  xAxisLabel: string;
  yAxisLabel: string;
  title: string;
  treatmentStart: number;
  treatmentStartLabel: string;
  referencePeriod: number;
  referenceLabel: string;
  preTreatmentLabel: string;
  postTreatmentLabel: string;
  dataPoints: DataPoint[];
}

interface InteractiveEventStudyChartProps {
  chartData: ChartData;
  fallbackPng?: string; // Fallback PNG if chartData is not available
}

const InteractiveEventStudyChart: React.FC<InteractiveEventStudyChartProps> = ({ chartData, fallbackPng }) => {
  const [labels, setLabels] = useState({
    xAxisLabel: chartData.xAxisLabel,
    yAxisLabel: chartData.yAxisLabel,
    title: chartData.title,
    treatmentStartLabel: chartData.treatmentStartLabel,
    referenceLabel: chartData.referenceLabel,
    preTreatmentLabel: chartData.preTreatmentLabel,
    postTreatmentLabel: chartData.postTreatmentLabel
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Transform data for recharts with error bars
  const chartDataFormatted = useMemo(() => {
    return chartData.dataPoints.map(point => ({
      relativeTime: point.relativeTime,
      coefficient: point.coefficient,
      ciLower: point.ciLower,
      ciUpper: point.ciUpper,
      errorLower: point.coefficient - point.ciLower,
      errorUpper: point.ciUpper - point.coefficient,
      isReference: point.isReference,
      isPreTreatment: point.isPreTreatment
    })).sort((a, b) => a.relativeTime - b.relativeTime);
  }, [chartData]);

  const handleLabelClick = (labelType: string, currentValue: string) => {
    setEditing(labelType);
    setEditValue(currentValue);
  };

  const handleLabelSave = () => {
    if (editing) {
      setLabels(prev => ({
        ...prev,
        [editing]: editValue
      }));
      setEditing(null);
      setEditValue('');
    }
  };

  const handleLabelCancel = () => {
    setEditing(null);
    setEditValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLabelSave();
    } else if (e.key === 'Escape') {
      handleLabelCancel();
    }
  };

  // If no chart data, show fallback PNG
  if (!chartData || !chartData.dataPoints || chartData.dataPoints.length === 0) {
    if (fallbackPng) {
      return (
        <img 
          src={`data:image/png;base64,${fallbackPng}`} 
          alt="Event Study Chart"
          style={{ width: '100%', maxWidth: '100%', height: 'auto' }}
        />
      );
    }
    return <div>No chart data available</div>;
  }

  // Separate pre and post treatment data
  const preTreatmentData = chartDataFormatted.filter(d => d.isPreTreatment);
  const postTreatmentData = chartDataFormatted.filter(d => !d.isPreTreatment && !d.isReference);
  const referenceData = chartDataFormatted.filter(d => d.isReference);

  return (
    <div style={{ width: '100%', padding: '20px' }}>
      {/* Editable Title */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        {editing === 'title' ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleLabelSave}
            onKeyDown={handleKeyPress}
            style={{
              fontSize: '18px',
              fontWeight: 'bold',
              textAlign: 'center',
              border: '2px solid #4F9CF9',
              borderRadius: '4px',
              padding: '4px 8px',
              width: '80%',
              maxWidth: '600px'
            }}
            autoFocus
          />
        ) : (
          <h3
            onClick={() => handleLabelClick('title', labels.title)}
            style={{
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              display: 'inline-block',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f0f0f0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Click to edit title"
          >
            {labels.title}
          </h3>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={450}>
        <LineChart data={chartDataFormatted} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          
          {/* Reference line at y=0 */}
          <ReferenceLine y={0} stroke="black" strokeWidth={1.5} />
          
          {/* Treatment start line */}
          <ReferenceLine
            x={chartData.treatmentStart}
            stroke="#666"
            strokeDasharray="3 3"
            strokeWidth={2}
          />

          {/* Shaded regions */}
          <defs>
            <linearGradient id="preTreatmentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4F9CF9" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#4F9CF9" stopOpacity={0.06} />
            </linearGradient>
            <linearGradient id="postTreatmentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF6B6B" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#FF6B6B" stopOpacity={0.06} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="relativeTime"
            label={{
              value: labels.xAxisLabel,
              position: 'insideBottom',
              offset: -10
            }}
            height={60}
          />
          <YAxis
            label={{
              value: labels.yAxisLabel,
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle' }
            }}
          />
          <Tooltip
            formatter={(value: number, name: string, props: any) => {
              if (name === 'coefficient') {
                return [
                  `${value.toFixed(4)} [${props.payload.ciLower.toFixed(4)}, ${props.payload.ciUpper.toFixed(4)}]`,
                  'Coefficient (95% CI)'
                ];
              }
              return [value, name];
            }}
            labelFormatter={(label) => `Time: ${label}`}
          />
          <Legend />

          {/* Pre-treatment points */}
          {preTreatmentData.length > 0 && (
            <Line
              type="monotone"
              dataKey="coefficient"
              data={preTreatmentData}
              stroke="#4F9CF9"
              strokeWidth={0}
              dot={{ fill: '#4F9CF9', r: 5, strokeWidth: 2, stroke: 'white' }}
              name={labels.preTreatmentLabel}
              connectNulls={false}
            />
          )}

          {/* Post-treatment points */}
          {postTreatmentData.length > 0 && (
            <Line
              type="monotone"
              dataKey="coefficient"
              data={postTreatmentData}
              stroke="#FF6B6B"
              strokeWidth={0}
              dot={{ fill: '#FF6B6B', r: 5, strokeWidth: 2, stroke: 'white' }}
              name={labels.postTreatmentLabel}
              connectNulls={false}
            />
          )}

          {/* Reference point */}
          {referenceData.length > 0 && (
            <Line
              type="monotone"
              dataKey="coefficient"
              data={referenceData}
              stroke="#666"
              strokeWidth={0}
              dot={{ fill: '#666', r: 6, strokeWidth: 2.5, stroke: 'white' }}
              name={labels.referenceLabel}
              connectNulls={false}
            />
          )}

          {/* Error bars - we'll need to render these manually via custom shapes */}
        </LineChart>
      </ResponsiveContainer>

      {/* Labels for regions */}
      <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
        <div>
          {editing === 'preTreatmentLabel' ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleLabelSave}
              onKeyDown={handleKeyPress}
              style={{ border: '2px solid #4F9CF9', borderRadius: '4px', padding: '2px 4px', fontSize: '12px' }}
              autoFocus
            />
          ) : (
            <span
              onClick={() => handleLabelClick('preTreatmentLabel', labels.preTreatmentLabel)}
              style={{ cursor: 'pointer', color: '#4F9CF9', fontWeight: 'bold' }}
              title="Click to edit"
            >
              {labels.preTreatmentLabel}
            </span>
          )}
        </div>
        <div>
          {editing === 'postTreatmentLabel' ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleLabelSave}
              onKeyDown={handleKeyPress}
              style={{ border: '2px solid #FF6B6B', borderRadius: '4px', padding: '2px 4px', fontSize: '12px' }}
              autoFocus
            />
          ) : (
            <span
              onClick={() => handleLabelClick('postTreatmentLabel', labels.postTreatmentLabel)}
              style={{ cursor: 'pointer', color: '#FF6B6B', fontWeight: 'bold' }}
              title="Click to edit"
            >
              {labels.postTreatmentLabel}
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: '10px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
        💡 Click on any label to edit it
      </div>
    </div>
  );
};

export default InteractiveEventStudyChart;
