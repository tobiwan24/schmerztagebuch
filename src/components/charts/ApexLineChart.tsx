import React, { useMemo } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { formatXAxisLabel } from '../../utils/apexChartHelpers';

interface ApexLineChartProps {
  series: {
    name: string;
    data: { x: string; y: number }[];
  }[];
  categories: string[];
  timeRange: 'T' | 'W' | 'M' | '6M' | 'J';
  colors?: string[];
  height?: number;
}

export const ApexLineChart: React.FC<ApexLineChartProps> = ({
  series,
  categories,
  timeRange,
  colors = ['#ef4444'],
  height = 350,
}) => {
  // Schutz vor leeren Series
  if (!series || series.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--muted-foreground))' }}>
        <p>Keine Daten vorhanden</p>
      </div>
    );
  }
  const chartOptions: ApexOptions = useMemo(() => {
    // Dark Mode Detection
    const isDarkMode = document.documentElement.classList.contains('dark');

    return {
      chart: {
        id: 'pain-chart-poc',
        type: 'line',
        height,
        toolbar: { show: false },
        background: 'transparent',
        foreColor: isDarkMode ? '#e5e7eb' : '#374151',
      },
      theme: {
        mode: isDarkMode ? 'dark' : 'light',
      },
      xaxis: {
        type: 'datetime',
        categories, // ISO-Dates direkt!
        labels: {
          formatter: (value: string) => formatXAxisLabel(value, timeRange),
          style: {
            colors: 'hsl(var(--muted-foreground))',
            fontSize: '12px',
          },
          rotate: 0,
        },
        axisBorder: {
          show: true,
          color: 'hsl(var(--border))',
        },
        axisTicks: {
          show: true,
          color: 'hsl(var(--border))',
        },
      },
      yaxis: {
        min: 0,
        max: 10,
        tickAmount: 5,
        labels: {
          style: {
            colors: 'hsl(var(--muted-foreground))',
            fontSize: '12px',
          },
        },
        axisBorder: {
          show: true,
          color: 'hsl(var(--border))',
        },
      },
      stroke: {
        width: 2,
        curve: 'smooth',
      },
      markers: {
        size: 6,
        strokeWidth: 2,
        strokeColors: '#fff',
        fillOpacity: 0, // Hohle Kreise
        hover: {
          size: 8,
        },
      },
      grid: {
        borderColor: 'hsl(var(--border))',
        strokeDashArray: 4,
        xaxis: {
          lines: { show: false },
        },
        yaxis: {
          lines: { show: true },
        },
      },
      tooltip: {
        theme: isDarkMode ? 'dark' : 'light',
        x: {
          format: 'dd.MM.yyyy',
        },
      },
      legend: {
        show: false,
      },
      colors,
      responsive: [
        {
          breakpoint: 768,
          options: {
            chart: {
              height: 300,
            },
            xaxis: {
              labels: {
                rotate: -45,
                style: {
                  fontSize: '10px',
                },
              },
            },
            yaxis: {
              labels: {
                style: {
                  fontSize: '10px',
                },
              },
            },
            markers: {
              size: 4,
              strokeWidth: 1.5,
              hover: {
                size: 6,
              },
            },
          },
        },
        {
          breakpoint: 480,
          options: {
            chart: {
              height: 250,
            },
            xaxis: {
              labels: {
                rotate: -45,
                style: {
                  fontSize: '9px',
                },
              },
            },
            yaxis: {
              labels: {
                style: {
                  fontSize: '9px',
                },
              },
            },
            markers: {
              size: 3,
              strokeWidth: 1,
              hover: {
                size: 5,
              },
            },
          },
        },
      ],
    };
  }, [categories, timeRange, colors, height]);

  return (
    <Chart
      type="line"
      series={series}
      options={chartOptions}
      height={height}
    />
  );
};
