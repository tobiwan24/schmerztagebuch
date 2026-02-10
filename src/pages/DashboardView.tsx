import { useState, useEffect, useMemo } from 'react';
import { getEntries, getTemplates } from '../db';
import type { Entry, Template } from '../types/database';
import Header from '../components/Header';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, CalendarClock, Stethoscope } from 'lucide-react';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { 
  extractPainData, 
  aggregatePainByDay,
  extractEvents,
  getDashboardEnabledTemplates,
  aggregateDataByTimeRange,
  type DailyPainData,
  type EventMarker,
  type PainDataPoint
} from '../utils/dashboardData';
import styles from '../styles/DashboardView.module.css';

// Vordefinierte Farbpalette für Charts (optimiert für Light & Dark Mode)
const CHART_COLORS = [
  '#FF0066', // Pink/Rot (Apple Health Style)
  '#3B82F6', // Blau
  '#10B981', // Grün
  '#F59E0B', // Orange
  '#8B5CF6', // Lila
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange-Rot
];

// Generiere Farbe für Template (vordefiniert oder dynamisch via HSL)
function getTemplateColor(index: number, totalTemplates: number): string {
  if (index < CHART_COLORS.length) {
    return CHART_COLORS[index];
  }
  const hue = (index * 360 / totalTemplates) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

interface DashboardViewProps {
  onBack: () => void;
  onNavigate: (view: 'editor' | 'history' | 'diary' | 'settings' | 'dashboard') => void;
}

export default function DashboardView({ onBack, onNavigate }: DashboardViewProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'T' | 'W' | 'M' | '6M' | 'J'>('M');
  const [dailyPainData, setDailyPainData] = useState<DailyPainData[]>([]);
  const [events, setEvents] = useState<EventMarker[]>([]);
  const [dashboardTemplates, setDashboardTemplates] = useState<Template[]>([]);
  const [visibleTemplates, setVisibleTemplates] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (entries.length > 0 && templates.length > 0) {
      aggregateData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, templates, timeRange]);

  async function loadData() {
    try {
      const [allEntries, allTemplates] = await Promise.all([
        getEntries(),
        getTemplates()
      ]);
      
      setEntries(allEntries);
      setTemplates(allTemplates);
      
      const dashTemplates = getDashboardEnabledTemplates(allTemplates);
      setDashboardTemplates(dashTemplates);
      setVisibleTemplates(new Set(dashTemplates.map(t => t.id!)));
    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Daten:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function aggregateData() {
    try {
      const painData = await extractPainData(entries, templates);
      const filteredPainData = filterPainDataByTimeRange(painData, timeRange);
      const dailyData = aggregatePainByDay(filteredPainData);
      
      // Adaptive Aggregation basierend auf Zeitraum
      const aggregatedData = aggregateDataByTimeRange(dailyData, timeRange);
      setDailyPainData(aggregatedData);
      
      const eventData = await extractEvents(entries, templates);
      const filteredEvents = filterEventsByTimeRange(eventData, timeRange);
      setEvents(filteredEvents);
    } catch (error) {
      console.error('Fehler beim Aggregieren der Daten:', error);
    }
  }
  
  function filterPainDataByTimeRange(data: PainDataPoint[], range: 'T' | 'W' | 'M' | '6M' | 'J') {
    if (range === 'J') {
      // Jahr: letzte 12 Monate
      const now = new Date();
      const cutoffDate = new Date(now);
      cutoffDate.setFullYear(now.getFullYear() - 1);
      return data.filter(point => new Date(point.date) >= cutoffDate);
    }
    
    const now = new Date();
    const cutoffDate = new Date(now);
    
    switch (range) {
      case 'T': {
        // Tag: Letzter kompletter Tag (00:00 bis 23:59)
        cutoffDate.setDate(now.getDate() - 1);
        cutoffDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'W': {
        // Woche: Letzte komplette Woche (Mo-So)
        const dayOfWeek = now.getDay();
        const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        cutoffDate.setDate(now.getDate() - daysToLastMonday - 7);
        cutoffDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'M': {
        // Monat: Letzter kompletter Monat
        cutoffDate.setMonth(now.getMonth() - 1);
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        break;
      }
      case '6M': {
        // 6 Monate: Letzte 6 Monate
        cutoffDate.setMonth(now.getMonth() - 6);
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        break;
      }
    }
    return data.filter(point => new Date(point.date) >= cutoffDate);
  }
  
  function filterEventsByTimeRange(data: EventMarker[], range: 'T' | 'W' | 'M' | '6M' | 'J') {
    if (range === 'J') {
      const now = new Date();
      const cutoffDate = new Date(now);
      cutoffDate.setFullYear(now.getFullYear() - 1);
      return data.filter(event => new Date(event.date) >= cutoffDate);
    }
    
    const now = new Date();
    const cutoffDate = new Date(now);
    
    switch (range) {
      case 'T': {
        cutoffDate.setDate(now.getDate() - 1);
        cutoffDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'W': {
        const dayOfWeek = now.getDay();
        const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        cutoffDate.setDate(now.getDate() - daysToLastMonday - 7);
        cutoffDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'M': {
        cutoffDate.setMonth(now.getMonth() - 1);
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        break;
      }
      case '6M': {
        cutoffDate.setMonth(now.getMonth() - 6);
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        break;
      }
    }
    return data.filter(event => new Date(event.date) >= cutoffDate);
  }

  // X-Achse Formatierung (Apple Health Style)
  const formatXAxis = (dateStr: string) => {
    const date = new Date(dateStr);
    
    switch(timeRange) {
      case 'T': {
        // Tag: Uhrzeiten (0, 8, 16, 24)
        const hour = date.getHours();
        return `${hour}h`;
      }
      case 'W': {
        // Woche: Wochentage (Mo, Di, Mi, Do, Fr, Sa, So)
        return date.toLocaleDateString('de-DE', { weekday: 'short' });
      }
      case 'M': {
        // Monat: Tage (1., 10., 20., 31.)
        return `${date.getDate()}.`;
      }
      case '6M': {
        // 6 Monate: Monatskürzel
        return date.toLocaleDateString('de-DE', { month: 'short' });
      }
      case 'J': {
        // Jahr: Alle 2 Monate
        return date.toLocaleDateString('de-DE', { month: 'short' });
      }
    }
  };
  
  // Tooltip Datum Formatierung
  const formatTooltipDate = (dateStr: string) => {
    const date = new Date(dateStr);
    
    switch(timeRange) {
      case 'T':
        return date.toLocaleDateString('de-DE', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      case 'W':
      case 'M':
        return date.toLocaleDateString('de-DE', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      case '6M':
        const weekEnd = new Date(date);
        weekEnd.setDate(date.getDate() + 6);
        return `${date.getDate()}.–${weekEnd.getDate()}. ${date.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}`;
      case 'J':
        return date.toLocaleDateString('de-DE', {
          month: 'long',
          year: 'numeric'
        });
    }
  };

  // Durchschnitt berechnen für Infobox
  const calculateAverage = () => {
    if (dailyPainData.length === 0) return 0;
    const allValues = dailyPainData.flatMap(d => [d.avg]);
    return Math.round((allValues.reduce((a, b) => a + b, 0) / allValues.length) * 10) / 10;
  };

  // Datumsbereich formatieren für Infobox
  const getDateRangeLabel = () => {
    if (dailyPainData.length === 0) return '';
    const dates = dailyPainData.map(d => new Date(d.date)).sort((a, b) => a.getTime() - b.getTime());
    const start = dates[0];
    const end = dates[dates.length - 1];
    return `${start.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  };

  // Trend berechnen: aktuelle vs. vorherige Periode
  const calculateTrend = (): { text: string; icon: string; diff: string } => {
    // Bei T zu wenig Daten für Trend
    if (timeRange === 'T') return { text: 'Ohne', icon: '', diff: '' };
    
    // Cutoff-Dauer für aktuelle Periode bestimmen
    const now = new Date();
    let periodDays = 7;
    switch (timeRange) {
      case 'W': periodDays = 7; break;
      case 'M': periodDays = 30; break;
      case '6M': periodDays = 182; break;
      case 'J': periodDays = 365; break;
    }
    
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - periodDays);
    const previousStart = new Date(currentStart);
    previousStart.setDate(currentStart.getDate() - periodDays);
    
    // Daten in aktuelle und vorherige Periode aufteilen
    const currentData = dailyPainData.filter(d => {
      const date = new Date(d.date);
      return date >= currentStart && date <= now;
    });
    const previousData = dailyPainData.filter(d => {
      const date = new Date(d.date);
      return date >= previousStart && date < currentStart;
    });
    
    // Mindestens 2 Datenpunkte in jeder Periode
    if (currentData.length < 2 || previousData.length < 2) {
      return { text: 'Ohne', icon: '', diff: '' };
    }
    
    const currentAvg = currentData.reduce((sum, d) => sum + d.avg, 0) / currentData.length;
    const previousAvg = previousData.reduce((sum, d) => sum + d.avg, 0) / previousData.length;
    const diff = currentAvg - previousAvg;
    
    if (Math.abs(diff) < 0.3) {
      return { text: 'Stabil', icon: '→', diff: '' };
    }
    if (diff > 0) {
      return { text: 'Steigend', icon: '↗', diff: `+${diff.toFixed(1)}` };
    }
    return { text: 'Sinkend', icon: '↘', diff: diff.toFixed(1) };
  };



  // ChartConfig
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    dashboardTemplates.forEach((template, index) => {
      const key = `template_${template.id}_avg`;
      const color = getTemplateColor(index, dashboardTemplates.length);
      config[key] = {
        label: template.name,
        color: color
      };
    });
    return config;
  }, [dashboardTemplates]);

  // Chart-Daten optimiert
  const chartData = useMemo(() => {
    if (dailyPainData.length === 0) return [];
    
    // Gruppiere nach Datum für schnellen Zugriff
    const dataByDate = new Map<string, DailyPainData[]>();
    dailyPainData.forEach(point => {
      if (!dataByDate.has(point.date)) {
        dataByDate.set(point.date, []);
      }
      dataByDate.get(point.date)!.push(point);
    });
    
    // Eindeutige Daten sortiert
    const uniqueDates = Array.from(new Set(dailyPainData.map(d => d.date))).sort();
    
    return uniqueDates.map(date => {
      const dayData: Record<string, string | number | null | EventMarker[]> = { date };
      
      // Template-Werte
      dashboardTemplates.forEach(template => {
        const key = `template_${template.id}_avg`;
        const points = dataByDate.get(date) || [];
        const templatePoint = points.find(d => d.templateId === template.id);
        dayData[key] = templatePoint ? templatePoint.avg : null;
      });
      
      // Event-Daten
      const dayEvents = events.filter(e => {
        const template = dashboardTemplates.find(t => t.name === e.templateName);
        return template && visibleTemplates.has(template.id ?? 0) && e.date === date;
      });
      dayData.events = dayEvents;
      
      return dayData;
    });
  }, [dailyPainData, dashboardTemplates, events, visibleTemplates]);

  const toggleTemplate = (templateId: number) => {
    const newVisible = new Set(visibleTemplates);
    if (newVisible.has(templateId)) newVisible.delete(templateId);
    else newVisible.add(templateId);
    setVisibleTemplates(newVisible);
  };

  // Custom Tooltip (Apple Health Style)
  interface TooltipPayloadEntry {
    dataKey: string;
    value: number | null;
    payload: Record<string, string | number | null | EventMarker[]>;
  }

  interface TooltipProps {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
  }

  const CustomChartTooltip = ({ active, payload }: TooltipProps) => {
    // Wenn nichts aktiv ist, zeige Durchschnitt + Datumsbereich
    if (!active || !payload || !payload.length) {
      return (
        <div className={styles.infoBox}>
          <p className={styles.infoLabel}>Durchschnitt</p>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className={styles.infoValue}>{calculateAverage()}</span>
            <span className={styles.infoUnit}>Punkte</span>
          </div>
          <p className={styles.infoDateRange}>{getDateRangeLabel()}</p>
        </div>
      );
    }
    
    // Wenn Werte angeklickt sind, zeige Punktwerte
    const data = payload[0].payload;
    const date = data.date;
    const events = data.events || [];
    
    return (
      <div className={styles.tooltip}>
        {/* Schmerzwerte */}
        {payload.map((entry) => {
          if (entry.dataKey === 'date' || entry.dataKey === 'events') return null;
          if (entry.value === null) return null;
          
          const template = dashboardTemplates.find(t => `template_${t.id}_avg` === entry.dataKey);
          if (!template) return null;
          
          return (
            <div key={entry.dataKey}>
              <p className={styles.tooltipLabel}>{template.name}</p>
              <div className={styles.tooltipValue}>
                <span>{entry.value.toFixed(1)}</span>
                <span className={styles.tooltipUnit}>Punkte</span>
              </div>
              <p className={styles.tooltipDate}>{formatTooltipDate(date)}</p>
            </div>
          );
        })}
        
        {/* Events */}
        {events.length > 0 && (
          <div className={styles.tooltipEvents}>
            {events.map((event: EventMarker, idx: number) => (
              <div key={idx} className={styles.tooltipEventItem}>
                <span className={styles.tooltipEventIcon}>
                  {event.category === 'doctor' ? '🩺' : '📅'}
                </span>
                <span>{event.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Custom Dot: Hohle Kreise + Event-Icons darüber
  interface CustomDotProps {
    cx?: number;
    cy?: number | null;
    payload: Record<string, string | number | null | EventMarker[]>;
  }

  const renderCustomDot = (color: string) => {  
    return (props: CustomDotProps) => {
      const { cx, cy, payload } = props;
      if (cx === undefined || cy === null || cy === undefined) return null;
      
      // Prüfe Events
      const dateEvents = events.filter(e => {
        const template = dashboardTemplates.find(t => t.name === e.templateName);
        return template && visibleTemplates.has(template.id ?? 0) && e.date === payload.date;
      });
      
      const hasDoctor = dateEvents.some(e => e.category === 'doctor');
      const hasEvent = dateEvents.some(e => e.category === 'event');
      
      return (
        <g>
          {/* Hohler Kreis (Apple Health Style) - WEIßE Füllung */}
          <circle 
            cx={cx} 
            cy={cy} 
            r={5}
            stroke={color}
            strokeWidth={2}
            fill="white"
          />
          
          {/* Event-Icon ÜBER dem Dot */}
          {(hasDoctor || hasEvent) && (
            <g>
              <circle 
                cx={cx} 
                cy={cy - 16}
                r={10}
                fill={hasDoctor ? '#ef4444' : '#3b82f6'}
                stroke="white"
                strokeWidth={2}
              />
              <foreignObject 
                x={cx - 8} 
                y={cy - 24} 
                width={16} 
                height={16}
              >
                <div style={{ 
                  width: 16, 
                  height: 16, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '10px'
                }}>
                  {hasDoctor ? <Stethoscope size={10} /> : <CalendarClock size={10} />}
                </div>
              </foreignObject>
            </g>
          )}
        </g>
      );
    };
  };

  // Template-Statistiken (aktuell nicht verwendet)
  // const templateStats = dashboardTemplates.map(template => {
  //   const templateData = dailyPainData.filter(d => d.templateId === template.id);
  //   const allValues = templateData.flatMap(d => [d.min, d.max, d.avg]);
  //   return {
  //     template,
  //     dataPoints: templateData.length,
  //     avgPain: allValues.length > 0 ? Math.round((allValues.reduce((a, b) => a + b, 0) / allValues.length) * 10) / 10 : 0,
  //     minPain: allValues.length > 0 ? Math.min(...allValues) : 0,
  //     maxPain: allValues.length > 0 ? Math.max(...allValues) : 0
  //   };
  // });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="spinner"></div>
          <p className="text-muted-foreground">Dashboard wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="Dashboard" onBack={onBack} />
      
      <div className="content-wrapper">
        <div className="space-y-3">
          {/* Zeitraum-Filter (Apple Health Style) */}
          <div className={styles.timeRangeFilter}>
            {(['T', 'W', 'M', '6M', 'J'] as const).map(range => (
              <button
                key={range}
                className={`${styles.timeRangeButton} ${timeRange === range ? styles.active : ''}`}
                onClick={() => setTimeRange(range)}
              >
                {range === '6M' ? '6 M.' : range}
              </button>
            ))}
          </div>

          {/* Chart */}
          {dashboardTemplates.length > 0 && dailyPainData.length > 0 ? (
            <div className="space-y-3">

              {/* Chart */}
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ left: 10, right: 0, top: 80, bottom: 5 }}
                  >
                    <CartesianGrid
                      vertical={true}
                      horizontal={true}
                      stroke="hsl(var(--border))"
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatXAxis}
                      tickLine={true}
                      axisLine={true}
                      interval="preserveStartEnd"
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      orientation="right"
                      domain={[0, 10]}
                      ticks={[0, 5, 10]}
                      tickLine={true}
                      axisLine={true}
                      width={25}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      stroke="hsl(var(--border))"
                    />
                    <ChartTooltip
                      cursor={{
                        stroke: 'hsl(var(--muted-foreground))',
                        strokeWidth: 1,
                        strokeDasharray: 'none'
                      }}
                      content={<CustomChartTooltip />}
                      position={{ y: -110 }}
                      wrapperStyle={{ pointerEvents: 'auto' }}
                    />
                    {dashboardTemplates.map((template, idx) => {
                      if (!visibleTemplates.has(template.id!)) return null;
                      const key = `template_${template.id}_avg`;
                      const color = chartConfig[key]?.color || getTemplateColor(idx, dashboardTemplates.length);
                      return (
                        <Line
                          key={template.id}
                          dataKey={key}
                          type="monotone"
                          stroke={color}
                          strokeWidth={2}
                          dot={renderCustomDot(color)}
                          activeDot={false}
                          connectNulls={true}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Template Legend UNTER dem Chart */}
              {dashboardTemplates.length > 1 && (
                <div className={styles.templateLegend}>
                  {dashboardTemplates.map((template, index) => {
                    const isVisible = visibleTemplates.has(template.id!);
                    const key = `template_${template.id}_avg`;
                    const color = chartConfig[key]?.color || getTemplateColor(index, dashboardTemplates.length);
                    return (
                      <div
                        key={template.id}
                        className={`${styles.templateIcon} ${!isVisible ? styles.inactive : ''}`}
                        onClick={() => toggleTemplate(template.id!)}
                        style={{ backgroundColor: color }}
                        title={template.name}
                      >
                        {template.name.charAt(0).toUpperCase()}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Trend Card */}
              {(() => {
                const trend = calculateTrend();
                return (
                  <div className={styles.trendCard}>
                    <span className={styles.trendLabel}>Trend</span>
                    <span className={styles.trendText}>
                      {trend.icon && `${trend.icon} `}{trend.text}{trend.diff && ` (${trend.diff})`}
                    </span>
                  </div>
                );
              })()}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <TrendingUp size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Noch keine Dashboard-Daten</h3>
              <p className="text-sm text-muted-foreground mb-4">Aktiviere Dashboard-Tracking in deinen Templates im Template-Editor.</p>
              <Button onClick={() => onNavigate('editor')} variant="outline">Zu Templates</Button>
            </Card>
          )}

          {/* Events */}
          {events.filter(e => {
            const template = dashboardTemplates.find(t => t.name === e.templateName);
            return template && visibleTemplates.has(template.id ?? 0);
          }).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Events & Arztbesuche</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {events.filter(e => {
                    const template = dashboardTemplates.find(t => t.name === e.templateName);
                    return template && visibleTemplates.has(template.id ?? 0);
                  }).slice(0, 5).map((event, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-2 bg-secondary/20 rounded">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(event.date).toLocaleDateString('de-DE')} • {event.templateName}</p>
                        {event.description && <p className="text-xs mt-1">{event.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {events.filter(e => {
                  const template = dashboardTemplates.find(t => t.name === e.templateName);
                  return template && visibleTemplates.has(template.id ?? 0);
                }).length > 5 && (
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    ...und {events.filter(e => {
                      const template = dashboardTemplates.find(t => t.name === e.templateName);
                      return template && visibleTemplates.has(template.id ?? 0);
                    }).length - 5} weitere Events
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
