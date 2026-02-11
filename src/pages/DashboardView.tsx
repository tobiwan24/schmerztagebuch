import { useState, useEffect, useMemo } from 'react';
import { getEntries, getTemplates } from '../db';
import type { Entry, Template } from '../types/database';
import Header from '../components/Header';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp } from 'lucide-react';
import { ApexLineChart } from '../components/charts/ApexLineChart';
import { 
  convertToApexSeries, 
  generateCategories, 
  type ChartConfig 
} from '../utils/apexChartHelpers';
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
  const [timeRangeOffset, setTimeRangeOffset] = useState(0); // 0 = aktuell, -1 = zurück, +1 = vorwärts
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
  }, [entries, templates, timeRange, timeRangeOffset]);

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
    const now = new Date();
    const cutoffDate = new Date(now);
    const endDate = new Date(now);
    
    switch (range) {
      case 'T': {
        // Tag: Heute + offset (00:00 bis 23:59)
        cutoffDate.setDate(now.getDate() + timeRangeOffset);
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() + timeRangeOffset);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'W': {
        // Woche: Diese Woche + offset (Mo bis So)
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        cutoffDate.setDate(now.getDate() - daysToMonday + (timeRangeOffset * 7));
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setDate(cutoffDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'M': {
        // Monat: Aktueller Monat + offset (1. bis letzter Tag)
        cutoffDate.setMonth(now.getMonth() + timeRangeOffset);
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setMonth(cutoffDate.getMonth() + 1);
        endDate.setDate(0); // Letzter Tag des Monats
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case '6M': {
        // 6 Monate: Letzte 6 Monate + offset
        cutoffDate.setMonth(now.getMonth() - 5 + (timeRangeOffset * 6));
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setMonth(cutoffDate.getMonth() + 6);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'J': {
        // Jahr: Letzte 12 Monate + offset
        cutoffDate.setMonth(now.getMonth() - 11 + (timeRangeOffset * 12));
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setMonth(cutoffDate.getMonth() + 12);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
    }
    return data.filter(point => {
      const pointDate = new Date(point.date);
      return pointDate >= cutoffDate && pointDate <= endDate;
    });
  }
  
  function filterEventsByTimeRange(data: EventMarker[], range: 'T' | 'W' | 'M' | '6M' | 'J') {
    const now = new Date();
    const cutoffDate = new Date(now);
    const endDate = new Date(now);
    
    switch (range) {
      case 'T': {
        cutoffDate.setDate(now.getDate() + timeRangeOffset);
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() + timeRangeOffset);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'W': {
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        cutoffDate.setDate(now.getDate() - daysToMonday + (timeRangeOffset * 7));
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setDate(cutoffDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'M': {
        cutoffDate.setMonth(now.getMonth() + timeRangeOffset);
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setMonth(cutoffDate.getMonth() + 1);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case '6M': {
        cutoffDate.setMonth(now.getMonth() - 5 + (timeRangeOffset * 6));
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setMonth(cutoffDate.getMonth() + 6);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'J': {
        cutoffDate.setMonth(now.getMonth() - 11 + (timeRangeOffset * 12));
        cutoffDate.setDate(1);
        cutoffDate.setHours(0, 0, 0, 0);
        endDate.setMonth(cutoffDate.getMonth() + 12);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
    }
    return data.filter(event => {
      const eventDate = new Date(event.date);
      return eventDate >= cutoffDate && eventDate <= endDate;
    });
  }



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

  // ApexCharts Series & Categories
  const apexSeries = useMemo(() => {
    return convertToApexSeries(dailyPainData, chartConfig, visibleTemplates);
  }, [dailyPainData, chartConfig, visibleTemplates]);

  const categories = useMemo(() => {
    return generateCategories(timeRange, new Date(), timeRangeOffset);
  }, [timeRange, timeRangeOffset]);

  // Template-Farben für ApexCharts
  const chartColors = useMemo(() => {
    return dashboardTemplates
      .filter(t => visibleTemplates.has(t.id!))
      .map((template, index) => {
        const key = `template_${template.id}_avg`;
        return chartConfig[key]?.color || getTemplateColor(index, dashboardTemplates.length);
      });
  }, [dashboardTemplates, visibleTemplates, chartConfig]);

  const toggleTemplate = (templateId: number) => {
    const newVisible = new Set(visibleTemplates);
    if (newVisible.has(templateId)) newVisible.delete(templateId);
    else newVisible.add(templateId);
    setVisibleTemplates(newVisible);
  };

  // Zeitraum-Navigation
  const handlePreviousTimeRange = () => {
    setTimeRangeOffset(timeRangeOffset - 1);
  };

  const handleNextTimeRange = () => {
    setTimeRangeOffset(timeRangeOffset + 1);
  };

  const handleResetTimeRange = () => {
    setTimeRangeOffset(0);
  };

  // Formatiere aktuellen Zeitraum für Anzeige
  const formatCurrentTimeRange = (): string => {
    const now = new Date();
    
    switch (timeRange) {
      case 'T': {
        // Heute + offset
        const targetDate = new Date(now);
        targetDate.setDate(now.getDate() + timeRangeOffset);
        return targetDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      case 'W': {
        // Diese Woche + offset (Montag bis heute)
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        monday.setDate(now.getDate() - daysToMonday + (timeRangeOffset * 7));
        
        // KW berechnen
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
        
        const mondayStr = monday.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
        const todayStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
        return `KW ${weekNumber} · ${mondayStr}–${todayStr}`;
      }
      case 'M': {
        // Aktueller Monat + offset
        const targetDate = new Date(now);
        targetDate.setMonth(now.getMonth() + timeRangeOffset);
        return targetDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      }
      case '6M': {
        // Letzte 6 Monate + offset
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(now.getMonth() - 5 + (timeRangeOffset * 6));
        const startMonth = sixMonthsAgo.toLocaleDateString('de-DE', { month: 'short' });
        const endMonth = now.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
        return `${startMonth}–${endMonth}`;
      }
      case 'J': {
        // Letzte 12 Monate + offset
        const twelveMonthsAgo = new Date(now);
        twelveMonthsAgo.setMonth(now.getMonth() - 11 + (timeRangeOffset * 12));
        const startMonth = twelveMonthsAgo.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
        const endMonth = now.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
        return `${startMonth}–${endMonth}`;
      }
      default:
        return '';
    }
  };

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
          <div>
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
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              marginTop: '8px'
            }}>
              <button
                onClick={handlePreviousTimeRange}
                style={{
                  background: 'hsl(var(--secondary))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: 'hsl(var(--foreground))'
                }}
              >
                ‹
              </button>
              <button
                onClick={handleResetTimeRange}
                disabled={timeRangeOffset === 0}
                style={{ 
                  textAlign: 'center', 
                  fontSize: '13px', 
                  color: timeRangeOffset === 0 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                  fontWeight: timeRangeOffset === 0 ? 600 : 500,
                  background: 'transparent',
                  border: 'none',
                  cursor: timeRangeOffset === 0 ? 'default' : 'pointer',
                  padding: '4px 8px',
                  textDecoration: timeRangeOffset === 0 ? 'none' : 'underline'
                }}
              >
                {formatCurrentTimeRange()}
              </button>
              <button
                onClick={handleNextTimeRange}
                style={{
                  background: 'hsl(var(--secondary))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: 'hsl(var(--foreground))'
                }}
              >
                ›
              </button>
            </div>
          </div>

          {/* Chart */}
          {dashboardTemplates.length > 0 ? (
            <div className="space-y-3">

              {/* Info-Box OBERHALB Chart */}
              {dailyPainData.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'hsl(var(--secondary) / 0.5)',
                  borderRadius: '12px',
                  marginBottom: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      DURCHSCHNITT
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '700', lineHeight: '1.2' }}>
                      {calculateAverage()}
                      <span style={{ fontSize: '16px', fontWeight: '400', marginLeft: '4px', color: 'hsl(var(--muted-foreground))' }}>Punkte</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginTop: '2px' }}>
                      {getDateRangeLabel()}
                    </div>
                  </div>
                </div>
              )}

              {/* ApexCharts */}
              <div className={styles.chartContainer}>
                <ApexLineChart
                  series={apexSeries}
                  categories={categories}
                  timeRange={timeRange}
                  colors={chartColors}
                  height={350}
                  events={events}
                  visibleTemplates={visibleTemplates}
                  dashboardTemplates={dashboardTemplates}
                />
              </div>

              {/* Keine Daten Message UNTER Chart */}
              {dailyPainData.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '24px',
                  color: 'hsl(var(--muted-foreground))'
                }}>
                  <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                    Keine Daten für {timeRange === 'T' ? 'heute' : timeRange === 'W' ? 'diese Woche' : timeRange === 'M' ? 'diesen Monat' : 'diesen Zeitraum'}
                  </p>
                  {timeRangeOffset !== 0 && (
                    <Button onClick={handleResetTimeRange} variant="outline" size="sm">
                      Zurück zu heute
                    </Button>
                  )}
                </div>
              )}

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
            </div>
          ) : dashboardTemplates.length > 0 ? (
            <Card className="p-8 text-center">
              <TrendingUp size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">
                Keine Daten für {timeRange === 'T' ? 'heute' : timeRange === 'W' ? 'diese Woche' : timeRange === 'M' ? 'diesen Monat' : 'diesen Zeitraum'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Erstelle Einträge im Tagebuch, um Daten zu sehen.
              </p>
              {timeRangeOffset !== 0 && (
                <Button onClick={handleResetTimeRange} variant="outline" className="mb-4">
                  Zurück zu heute
                </Button>
              )}
            </Card>
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
