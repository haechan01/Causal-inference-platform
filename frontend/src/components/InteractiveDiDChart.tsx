import React, { useState, useMemo, useRef, forwardRef, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

interface ChartDataPoint {
  [key: string]: number | string;
}

interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
  color: string;
  type: 'line' | 'dashed';
}

interface ChartData {
  xAxisLabel: string;
  yAxisLabel: string;
  title: string;
  treatmentStart: number | string;
  treatmentStartLabel: string;
  series: ChartSeries[];
}

interface InteractiveDiDChartProps {
  chartData: ChartData;
  fallbackPng?: string; // Fallback PNG if chartData is not available
}

const InteractiveDiDChart = forwardRef<HTMLDivElement, InteractiveDiDChartProps>(({ chartData, fallbackPng }, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null); // Ref for chart area only (without download button and edit labels)
  const [labels, setLabels] = useState({
    xAxisLabel: chartData.xAxisLabel,
    yAxisLabel: chartData.yAxisLabel,
    title: chartData.title,
    treatmentStartLabel: chartData.treatmentStartLabel,
    seriesNames: chartData.series.reduce((acc, s) => {
      acc[s.name] = s.name;
      return acc;
    }, {} as Record<string, string>)
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Transform data for recharts
  const chartDataFormatted = useMemo(() => {
    if (!chartData.series || chartData.series.length === 0) return [];

    const xKey = chartData.xAxisLabel;
    const timePoints = new Set<number | string>();
    
    // Collect all unique time points
    chartData.series.forEach(series => {
      series.data.forEach(point => {
        timePoints.add(point[xKey] as number | string);
      });
    });

    // Create combined data points
    const formatted: any[] = [];
    Array.from(timePoints).sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b));
    }).forEach(timePoint => {
      const point: any = { [xKey]: timePoint };
      chartData.series.forEach(series => {
        const seriesPoint = series.data.find(p => p[xKey] === timePoint);
        if (seriesPoint) {
          // Find the value key (could be outcome_var or 'counterfactual' or any other value column)
          const valueKeys = Object.keys(seriesPoint).filter(k => k !== xKey);
          if (valueKeys.length > 0) {
            // Use the first value key found, or use series name as fallback
            const valueKey = valueKeys[0];
            point[series.name] = seriesPoint[valueKey];
          }
        }
      });
      formatted.push(point);
    });

    return formatted;
  }, [chartData]);

  const handleLabelClick = (labelType: string, currentValue: string) => {
    setEditing(labelType);
    setEditValue(currentValue);
  };

  const handleLabelSave = () => {
    if (editing) {
      if (editing.startsWith('series-')) {
        const seriesName = editing.replace('series-', '');
        setLabels(prev => ({
          ...prev,
          seriesNames: {
            ...prev.seriesNames,
            [seriesName]: editValue
          }
        }));
      } else {
        setLabels(prev => ({
          ...prev,
          [editing]: editValue
        }));
      }
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

  // Function to download chart as PNG
  const downloadChart = useCallback(async () => {
    // Use chartAreaRef which excludes download button and edit labels
    if (!chartAreaRef.current) {
      return;
    }
    
    try {
      // Dynamically import html2canvas if not already loaded
      const html2canvasModule = await import('html2canvas');
      const html2canvasFn = html2canvasModule.default;
      
      // Wait a bit to ensure chart is fully rendered
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const canvas = await html2canvasFn(chartAreaRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher quality
        logging: false,
        useCORS: true,
        allowTaint: false,
        width: chartAreaRef.current.scrollWidth,
        height: chartAreaRef.current.scrollHeight
      } as any);
      
      canvas.toBlob((blob: Blob | null) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'did_analysis_chart.png';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } else {
          console.error('Failed to create blob from canvas');
          // Fallback to original PNG if available
          if (fallbackPng) {
            const link = document.createElement('a');
            link.href = `data:image/png;base64,${fallbackPng}`;
            link.download = 'did_analysis_chart.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error capturing chart:', error);
      // Fallback to original PNG if available
      if (fallbackPng) {
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${fallbackPng}`;
        link.download = 'did_analysis_chart.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  }, [fallbackPng]);


  // If no chart data, show fallback PNG
  if (!chartData || !chartData.series || chartData.series.length === 0) {
    if (fallbackPng) {
      return (
        <img 
          src={`data:image/png;base64,${fallbackPng}`} 
          alt="Difference-in-Differences Analysis Chart"
          style={{ width: '100%', maxWidth: '100%', height: 'auto' }}
        />
      );
    }
    return <div>No chart data available</div>;
  }

  return (
    <div ref={chartContainerRef} style={{ width: '100%', padding: '24px', backgroundColor: '#ffffff', borderRadius: '8px', position: 'relative' }}>
      {/* Download Button */}
      <div style={{ marginBottom: '16px', textAlign: 'right' }}>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadChart();
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: '#4F9CF9',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#3d7bd6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#4F9CF9';
          }}
          type="button"
          title="Download chart as PNG"
        >
          ⬇️ Download Chart
        </button>
      </div>

      {/* Chart Area - This is what gets captured in screenshot */}
      <div ref={chartAreaRef}>
        {/* Editable Title */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          {editing === 'title' ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleLabelSave}
              onKeyDown={handleKeyPress}
              style={{
                fontSize: '20px',
                fontWeight: '600',
                textAlign: 'center',
                border: '2px solid #4F9CF9',
                borderRadius: '6px',
                padding: '6px 12px',
                width: '80%',
                maxWidth: '600px',
                color: '#1a1a1a'
              }}
              autoFocus
            />
          ) : (
            <h3
              onClick={() => handleLabelClick('title', labels.title)}
              style={{
                fontSize: '20px',
                fontWeight: '600',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
                display: 'inline-block',
                transition: 'all 0.2s',
                color: '#1a1a1a',
                margin: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f7fa';
                e.currentTarget.style.color = '#4F9CF9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#1a1a1a';
              }}
              title="Click to edit title"
            >
              {labels.title}
            </h3>
          )}
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={450}>
        <LineChart data={chartDataFormatted} margin={{ top: 20, right: 30, left: 60, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" strokeWidth={1} />
          <XAxis
            dataKey={chartData.xAxisLabel}
            label={{
              value: labels.xAxisLabel,
              position: 'insideBottom',
              offset: -5,
              style: { textAnchor: 'middle', fill: '#666', fontSize: '13px', fontWeight: '500' }
            }}
            tick={{ fill: '#666', fontSize: '12px' }}
            tickLine={{ stroke: '#d0d0d0' }}
            angle={chartDataFormatted.length > 8 ? -45 : 0}
            textAnchor={chartDataFormatted.length > 8 ? 'end' : 'middle'}
            height={70}
          />
          <YAxis
            label={{
              value: labels.yAxisLabel,
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: '#666', fontSize: '13px', fontWeight: '500' }
            }}
            tick={{ fill: '#666', fontSize: '12px' }}
            tickLine={{ stroke: '#d0d0d0' }}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
            labelStyle={{ fontWeight: '600', color: '#1a1a1a' }}
          />
          <Legend
            wrapperStyle={{ paddingTop: '24px', paddingBottom: '8px' }}
            iconType="line"
            formatter={(value) => {
              const seriesKey = chartData.series.find(s => s.name === value)?.name || value;
              if (editing === `series-${seriesKey}`) {
                return (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleLabelSave}
                    onKeyDown={handleKeyPress}
                    style={{
                      border: '2px solid #4F9CF9',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '13px',
                      width: '150px'
                    }}
                    autoFocus
                  />
                );
              }
              return (
                <span
                  onClick={() => handleLabelClick(`series-${seriesKey}`, labels.seriesNames[seriesKey] || seriesKey)}
                  style={{
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#666',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f7fa';
                    e.currentTarget.style.color = '#4F9CF9';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#666';
                  }}
                  title="Click to edit"
                >
                  {labels.seriesNames[seriesKey] || seriesKey}
                </span>
              );
            }}
          />
          
          {/* Reference line for treatment start */}
          <ReferenceLine
            x={chartData.treatmentStart}
            stroke="#e74c3c"
            strokeWidth={2}
            strokeDasharray="4 4"
            label={{
              value: labels.treatmentStartLabel,
              position: 'top',
              fill: '#e74c3c',
              fontSize: '11px',
              fontWeight: '500'
            }}
          />

          {/* Render lines for each series */}
          {chartData.series.map((series, index) => {
            const displayName = labels.seriesNames[series.name] || series.name;
            if (series.type === 'dashed') {
              return (
                <Line
                  key={series.name}
                  type="monotone"
                  dataKey={series.name}
                  stroke={series.color}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ fill: series.color, r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#ffffff' }}
                  name={displayName}
                />
              );
            }
            return (
              <Line
                key={series.name}
                type="monotone"
                dataKey={series.name}
                stroke={series.color}
                strokeWidth={2.5}
                dot={{ fill: series.color, r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: '#ffffff' }}
                name={displayName}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      </div>

      {/* Compact Label Editors */}
      <div style={{
        marginTop: '1px',
        padding: '8px',
        backgroundColor: '#f8f9fa',
        borderRadius: '6px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        justifyContent: 'center',
        fontSize: '14px',
        color: '#666'
      }}>
        <span style={{ color: '#666', fontWeight: '500' }}>Edit labels:</span>
        <span
          onClick={() => handleLabelClick('xAxisLabel', labels.xAxisLabel)}
          style={{
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: '#ffffff',
            border: '1px solid #e0e0e0',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#4F9CF9';
            e.currentTarget.style.color = '#4F9CF9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e0e0e0';
            e.currentTarget.style.color = '#666';
          }}
          title="Click to edit X-axis"
        >
          X: {labels.xAxisLabel}
        </span>
        <span
          onClick={() => handleLabelClick('yAxisLabel', labels.yAxisLabel)}
          style={{
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: '#ffffff',
            border: '1px solid #e0e0e0',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#4F9CF9';
            e.currentTarget.style.color = '#4F9CF9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e0e0e0';
            e.currentTarget.style.color = '#666';
          }}
          title="Click to edit Y-axis"
        >
          Y: {labels.yAxisLabel}
        </span>
        <span
          onClick={() => handleLabelClick('treatmentStartLabel', labels.treatmentStartLabel)}
          style={{
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: '#ffffff',
            border: '1px solid #e0e0e0',
            transition: 'all 0.2s',
            color: '#e74c3c'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#e74c3c';
            e.currentTarget.style.backgroundColor = '#ffeaea';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e0e0e0';
            e.currentTarget.style.backgroundColor = '#ffffff';
          }}
          title="Click to edit treatment start label"
        >
          Treatment: {labels.treatmentStartLabel}
        </span>
      </div>

      {/* Inline editing inputs */}
      {editing === 'xAxisLabel' && (
        <div style={{ marginTop: '8px', textAlign: 'center' }}>
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleLabelSave}
            onKeyDown={handleKeyPress}
            style={{
              border: '2px solid #4F9CF9',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '13px',
              minWidth: '200px'
            }}
            autoFocus
          />
        </div>
      )}
      {editing === 'yAxisLabel' && (
        <div style={{ marginTop: '8px', textAlign: 'center' }}>
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleLabelSave}
            onKeyDown={handleKeyPress}
            style={{
              border: '2px solid #4F9CF9',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '13px',
              minWidth: '200px'
            }}
            autoFocus
          />
        </div>
      )}
      {editing === 'treatmentStartLabel' && (
        <div style={{ marginTop: '8px', textAlign: 'center' }}>
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleLabelSave}
            onKeyDown={handleKeyPress}
            style={{
              border: '2px solid #e74c3c',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '13px',
              minWidth: '200px'
            }}
            autoFocus
          />
        </div>
      )}
    </div>
  );
});

InteractiveDiDChart.displayName = 'InteractiveDiDChart';

export default InteractiveDiDChart;
