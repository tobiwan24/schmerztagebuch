import React, { useState, useEffect, useMemo } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { formatXAxisLabel, formatTooltipDate } from '../../utils/apexChartHelpers';
import type { EventMarker } from '../../utils/dashboardData';

interface ApexLineChartProps {
  series: {
    name: string;
    data: { x: string; y: number }[];
  }[];
  categories: string[];
  timeRange: 'T' | 'W' | 'M' | '6M' | 'J';
  colors?: string[];
  height?: number;
  events?: EventMarker[];
  visibleTemplates?: Set<number>;
  dashboardTemplates?: Array<{ id?: number; name: string }>;
  functionSeries?: { name: string; data: { x: string; y: number }[] }[];
  functionYAxisMax?: number;
}

export const ApexLineChart: React.FC<ApexLineChartProps> = ({
  series,
  categories,
  timeRange,
  colors = ['#ef4444'],
  height = 350,
  events = [],
  visibleTemplates = new Set(),
  dashboardTemplates = [],
  functionSeries,
  functionYAxisMax = 10,
}) => {
  const [isDarkMode, setIsDarkMode] = useState(
    () => document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const chartOptions: ApexOptions = useMemo(() => {

    // Event Annotations erstellen - als Points direkt über Datenpunkten
    const eventPointAnnotations = events
      .filter(event => {
        const template = dashboardTemplates.find(t => t.name === event.templateName);
        return template && visibleTemplates.has(template.id ?? 0);
      })
      .map(event => {
        // Finde Y-Wert (Schmerzwert) für dieses Event-Datum
        const dateStr = event.date;
        let yValue = 5; // Fallback Mitte
        
        // Suche in series nach dem Datenpunkt
        series.forEach(s => {
          const point = s.data.find(p => p.x === dateStr);
          if (point) {
            yValue = point.y;
          }
        });
        
        return {
          x: new Date(event.date).getTime(),
          y: yValue,
          marker: {
            size: 0, // Kein Marker, nur Label
          },
          label: {
            text: event.category === 'doctor' ? '🩺' : '📅',
            offsetY: -20, // Über dem Punkt
            borderWidth: 0, // Keine Umrandung
            style: {
              background: 'transparent',
              fontSize: '18px',
              cssClass: 'event-icon-label',
              padding: {
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              },
            },
          },
        };
      });

    const hasFunctionSeries = functionSeries && functionSeries.length > 0;
    const painCount = series.length;

    return {
      chart: {
        id: 'pain-chart-poc',
        type: 'line',
        height,
        toolbar: { show: false },
        background: 'transparent',
        foreColor: isDarkMode ? '#e5e7eb' : '#374151',
        offsetX: -10, // Chart nach links verschieben
        zoom: { enabled: false },
        selection: { enabled: false },
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
        crosshairs: {
          show: true,
          width: 1,
          position: 'back',
          stroke: { color: 'hsl(var(--muted-foreground))', width: 1, dashArray: 3 },
        },
      },
      yaxis: hasFunctionSeries ? [
        {
          min: 0,
          max: 10.5,
          tickAmount: 5,
          forceNiceScale: false,
          labels: {
            offsetX: -5,
            minWidth: 20,
            style: {
              colors: 'hsl(var(--muted-foreground))',
              fontSize: '12px',
            },
          },
          axisBorder: { show: true, color: 'hsl(var(--border))' },
        },
        {
          opposite: true,
          min: 0,
          max: functionYAxisMax + 0.5,
          tickAmount: 5,
          forceNiceScale: false,
          labels: {
            offsetX: 5,
            minWidth: 20,
            style: {
              colors: 'hsl(var(--muted-foreground))',
              fontSize: '12px',
            },
          },
          axisBorder: { show: true, color: 'hsl(var(--border))' },
        },
      ] : {
        min: 0,
        max: 10.5,
        tickAmount: 5,
        forceNiceScale: false,
        labels: {
          offsetX: -5,
          minWidth: 20,
          style: {
            colors: 'hsl(var(--muted-foreground))',
            fontSize: '12px',
          },
        },
        axisBorder: { show: true, color: 'hsl(var(--border))' },
      },
      stroke: {
        width: hasFunctionSeries
          ? [...Array(painCount).fill(2), ...Array(functionSeries!.length).fill(1)]
          : 2,
        curve: (hasFunctionSeries
          ? [...Array(painCount).fill('smooth'), ...Array(functionSeries!.length).fill('stepline')]
          : 'smooth') as 'smooth' | 'stepline' | ('smooth' | 'stepline')[],
      },
      fill: {
        type: 'solid',
        opacity: hasFunctionSeries
          ? [...Array(painCount).fill(1), ...Array(functionSeries!.length).fill(0.2)]
          : 1,
      },
      markers: {
        size: 5,
        strokeWidth: 2,
        strokeColors: '#fff',
        fillOpacity: 1, // Gefüllte Kreise wie im Bild
        hover: {
          size: 7,
        },
      },
      grid: {
        borderColor: 'hsl(var(--border))',
        strokeDashArray: 4,
        padding: {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        },
        xaxis: {
          lines: { show: false },
        },
        yaxis: {
          lines: { show: true },
        },
      },
      tooltip: {
        enabled: true,
        theme: isDarkMode ? 'dark' : 'light',
        shared: false,
        intersect: false,
        x: {
          show: false,  // Datums-Marker unter X-Achse ausblenden
          format: undefined,
        },
        marker: {
          show: false,  // Marker im Tooltip ausblenden
        },
        custom: ({ seriesIndex, dataPointIndex, w }) => {
          if (seriesIndex < 0 || dataPointIndex < 0) return '';
          const dataPoint = w.globals.initialSeries[seriesIndex]?.data[dataPointIndex];
          if (!dataPoint) return '';
          const date = dataPoint.x;
          const value = dataPoint.y;
          const seriesName = w.globals.seriesNames[seriesIndex];
          
          // Finde Events für dieses Datum
          const dateStr = new Date(date).toISOString().split('T')[0];
          const dayEvents = events.filter(e => {
            const template = dashboardTemplates.find(t => t.name === e.templateName);
            return template && visibleTemplates.has(template.id ?? 0) && e.date === dateStr;
          });

          let tooltipHTML = `
            <div style="padding: 8px 12px; background: ${isDarkMode ? '#1f2937' : '#ffffff'}; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="font-weight: 600; margin-bottom: 4px; color: ${isDarkMode ? '#e5e7eb' : '#374151'};">${seriesName}</div>
              <div style="display: flex; align-items: baseline; gap: 4px; margin-bottom: 4px;">
                <span style="font-size: 18px; font-weight: 700; color: ${isDarkMode ? '#ffffff' : '#000000'};">${value.toFixed(1)}</span>
                <span style="font-size: 12px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'};">Punkte</span>
              </div>
              <div style="font-size: 11px; color: ${isDarkMode ? '#9ca3af' : '#6b7280'};">${formatTooltipDate(new Date(date).toISOString(), timeRange)}</div>
          `;

          if (dayEvents.length > 0) {
            tooltipHTML += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${isDarkMode ? '#374151' : '#e5e7eb'};">`;
            dayEvents.forEach(event => {
              const icon = event.category === 'doctor' ? '🩺' : '📅';
              tooltipHTML += `
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                  <span style="font-size: 14px;">${icon}</span>
                  <span style="font-size: 12px; color: ${isDarkMode ? '#e5e7eb' : '#374151'};">${event.title}</span>
                </div>
              `;
            });
            tooltipHTML += `</div>`;
          }

          tooltipHTML += `</div>`;
          return tooltipHTML;
        },
      },
      annotations: {
        points: eventPointAnnotations,
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
  }, [categories, timeRange, colors, height, events, visibleTemplates, dashboardTemplates, series, isDarkMode, functionSeries, functionYAxisMax]);

  const combinedSeries = useMemo(() => {
    const painSeries = series.map(s => ({ ...s, type: 'line' as const }));
    const fnSeries = (functionSeries ?? []).map(s => ({ ...s, type: 'area' as const }));
    return [...painSeries, ...fnSeries];
  }, [series, functionSeries]);

  // Schutz vor leeren Series (nach useMemo, damit Hooks-Reihenfolge konstant bleibt)
  if (!series || series.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--muted-foreground))' }}>
        <p>Keine Daten vorhanden</p>
      </div>
    );
  }

  return (
    <Chart
      type="line"
      series={combinedSeries}
      options={chartOptions}
      height={height}
    />
  );
};
