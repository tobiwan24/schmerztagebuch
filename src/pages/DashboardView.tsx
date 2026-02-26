import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getEntries, getTemplates } from '../db';
import type { Entry, Template } from '../types/database';
import Header from '../components/Header';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, CircleSlash2, ArrowUpRight, ArrowRight, ArrowDownRight, ChevronLeft, ChevronRight, TrendingUpDown, ChartArea } from 'lucide-react';
import { ApexLineChart } from '../components/charts/ApexLineChart';
import PageTutorial from '../components/tutorial/PageTutorial';
import {
  convertToApexSeries,
  convertFunctionToApexSeries,
  generateCategories,
  type ChartConfig
} from '../utils/apexChartHelpers';
import {
  extractPainData,
  aggregatePainByDay,
  extractFunctionData,
  aggregateFunctionByDay,
  extractEvents,
  getDashboardEnabledTemplates,
  aggregateDataByTimeRange,
  type DailyPainData,
  type DailyFunctionData,
  type EventMarker,
} from '../utils/dashboardData';
import styles from '../styles/DashboardView.module.css';
import { useNavigation } from '../contexts/NavigationContext';
import { getIconComponent } from '../utils/iconUtils';
import { decryptData } from '../utils/crypto';
import { getSessionPassword } from '../utils/auth';

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

function calculateTrendFrom(
  data: DailyPainData[],
  timeRange: 'T' | 'W' | 'M' | '6M' | 'J',
  timeRangeOffset: number
): { text: string; icon: string; diff: string } {
  if (timeRange === 'T') return { text: 'Ohne', icon: '', diff: '' };
  if (data.length === 0) return { text: 'Ohne', icon: '', diff: '' };

  const now = new Date();
  const currentStart = new Date();
  const currentEnd = new Date();
  const previousStart = new Date();
  const previousEnd = new Date();

  switch (timeRange) {
    case 'W': {
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      currentStart.setDate(now.getDate() - daysToMonday + (timeRangeOffset * 7));
      currentStart.setHours(0, 0, 0, 0);
      currentEnd.setDate(currentStart.getDate() + 6);
      currentEnd.setHours(23, 59, 59, 999);
      previousStart.setDate(currentStart.getDate() - 7);
      previousStart.setHours(0, 0, 0, 0);
      previousEnd.setDate(currentStart.getDate() - 1);
      previousEnd.setHours(23, 59, 59, 999);
      break;
    }
    case 'M': {
      currentStart.setMonth(now.getMonth() + timeRangeOffset);
      currentStart.setDate(1);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd.setMonth(currentStart.getMonth() + 1);
      currentEnd.setDate(0);
      currentEnd.setHours(23, 59, 59, 999);
      previousStart.setMonth(currentStart.getMonth() - 1);
      previousStart.setDate(1);
      previousStart.setHours(0, 0, 0, 0);
      previousEnd.setMonth(previousStart.getMonth() + 1);
      previousEnd.setDate(0);
      previousEnd.setHours(23, 59, 59, 999);
      break;
    }
    case '6M': {
      currentStart.setMonth(now.getMonth() - 5 + (timeRangeOffset * 6));
      currentStart.setDate(1);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd.setMonth(currentStart.getMonth() + 6);
      currentEnd.setDate(0);
      currentEnd.setHours(23, 59, 59, 999);
      previousStart.setMonth(currentStart.getMonth() - 6);
      previousStart.setDate(1);
      previousStart.setHours(0, 0, 0, 0);
      previousEnd.setMonth(previousStart.getMonth() + 6);
      previousEnd.setDate(0);
      previousEnd.setHours(23, 59, 59, 999);
      break;
    }
    case 'J': {
      currentStart.setMonth(now.getMonth() - 11 + (timeRangeOffset * 12));
      currentStart.setDate(1);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd.setMonth(currentStart.getMonth() + 12);
      currentEnd.setDate(0);
      currentEnd.setHours(23, 59, 59, 999);
      previousStart.setMonth(currentStart.getMonth() - 12);
      previousStart.setDate(1);
      previousStart.setHours(0, 0, 0, 0);
      previousEnd.setMonth(previousStart.getMonth() + 12);
      previousEnd.setDate(0);
      previousEnd.setHours(23, 59, 59, 999);
      break;
    }
  }

  const currentPeriodData = data.filter(d => {
    const date = new Date(d.date);
    return date >= currentStart && date <= currentEnd;
  });
  const previousPeriodData = data.filter(d => {
    const date = new Date(d.date);
    return date >= previousStart && date <= previousEnd;
  });

  if (currentPeriodData.length < 2 || previousPeriodData.length < 2) {
    return { text: 'Ohne', icon: '', diff: '' };
  }

  const currentAvg = currentPeriodData.reduce((sum, d) => sum + d.avg, 0) / currentPeriodData.length;
  const previousAvg = previousPeriodData.reduce((sum, d) => sum + d.avg, 0) / previousPeriodData.length;
  const diff = currentAvg - previousAvg;

  if (Math.abs(diff) < 0.3) return { text: 'Stabil', icon: '→', diff: '' };
  if (diff > 0) return { text: 'Steigend', icon: '↗', diff: `+${diff.toFixed(1)}` };
  return { text: 'Sinkend', icon: '↘', diff: diff.toFixed(1) };
}

export default function DashboardView() {
  const { goHome: onBack, navigate: onNavigate } = useNavigation();

  // Decrypt function for encrypted entries
  const decryptFn = useCallback(async (data: string): Promise<string> => {
    const password = getSessionPassword();
    if (!password) throw new Error('Keine aktive Session');
    return decryptData(data, password);
  }, []);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'T' | 'W' | 'M' | '6M' | 'J'>('M');
  const [timeRangeOffset, setTimeRangeOffset] = useState(0); // 0 = aktuell, -1 = zurück, +1 = vorwärts
  const [dailyPainData, setDailyPainData] = useState<DailyPainData[]>([]);
  const [allDailyPainData, setAllDailyPainData] = useState<DailyPainData[]>([]);
  const [events, setEvents] = useState<EventMarker[]>([]);
  const [dashboardTemplates, setDashboardTemplates] = useState<Template[]>([]);
  const [visibleTemplates, setVisibleTemplates] = useState<Set<number>>(new Set());
  const [dailyFunctionData, setDailyFunctionData] = useState<DailyFunctionData[]>([]);
  const [visibleFunctionSeries, setVisibleFunctionSeries] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [allEntries, allTemplates] = await Promise.all([getEntries(), getTemplates()]);
        if (cancelled) return;
        setEntries(allEntries);
        setTemplates(allTemplates);
        const dashTemplates = getDashboardEnabledTemplates(allTemplates);
        setDashboardTemplates(dashTemplates);
        setVisibleTemplates(new Set(dashTemplates.map(t => t.id!)));
      } catch (error) {
        console.error('Fehler beim Laden der Dashboard-Daten:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (entries.length === 0 || templates.length === 0) return;
    let cancelled = false;
    async function load() {
      try {
        const painData = await extractPainData(entries, templates, decryptFn);
        if (cancelled) return;
        const allDaily = aggregatePainByDay(painData);
        if (!cancelled) setAllDailyPainData(allDaily);
        const filteredPainData = filterByTimeRange(painData, timeRange);
        const dailyData = aggregatePainByDay(filteredPainData);
        const aggregatedData = aggregateDataByTimeRange(dailyData, timeRange);
        if (!cancelled) setDailyPainData(aggregatedData);
        const eventData = await extractEvents(entries, templates, decryptFn);
        if (cancelled) return;
        const filteredEventData = filterByTimeRange(eventData, timeRange);
        if (!cancelled) setEvents(filteredEventData);
        const functionPoints = await extractFunctionData(entries, templates, decryptFn);
        if (cancelled) return;
        const filteredFunctionPoints = filterByTimeRange(functionPoints, timeRange);
        const aggregatedFunction = aggregateFunctionByDay(filteredFunctionPoints);
        if (!cancelled) {
          setDailyFunctionData(aggregatedFunction);
          setVisibleFunctionSeries(new Set(aggregatedFunction.map(d => d.templateId)));
        }
      } catch (error) {
        console.error('Fehler beim Aggregieren der Daten:', error);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, templates, timeRange, timeRangeOffset, decryptFn]);

  function filterByTimeRange<T extends { date: string }>(data: T[], range: 'T' | 'W' | 'M' | '6M' | 'J'): T[] {
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
    return data.filter(item => {
      const d = new Date(item.date);
      return d >= cutoffDate && d <= endDate;
    });
  }

  const average = useMemo(() => {
    const visibleData = dailyPainData.filter(d => visibleTemplates.has(d.templateId));
    if (visibleData.length === 0) return 0;
    const sum = visibleData.reduce((a, d) => a + d.avg, 0);
    return Math.round((sum / visibleData.length) * 10) / 10;
  }, [dailyPainData, visibleTemplates]);

  const trend = useMemo(
    () => calculateTrendFrom(allDailyPainData, timeRange, timeRangeOffset),
    [allDailyPainData, timeRange, timeRangeOffset]
  );



  const filteredEvents = useMemo(
    () => events.filter(e => {
      const template = dashboardTemplates.find(t => t.name === e.templateName);
      return template && visibleTemplates.has(template.id ?? 0);
    }),
    [events, dashboardTemplates, visibleTemplates]
  );

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

  const toggleFunctionSeries = (templateId: number) => {
    const newVisible = new Set(visibleFunctionSeries);
    if (newVisible.has(templateId)) newVisible.delete(templateId);
    else newVisible.add(templateId);
    setVisibleFunctionSeries(newVisible);
  };

  const functionApexSeries = useMemo(() =>
    convertFunctionToApexSeries(dailyFunctionData, chartConfig, visibleFunctionSeries),
    [dailyFunctionData, chartConfig, visibleFunctionSeries]
  );

  const functionYAxisMax = useMemo(() => {
    const maxes = dailyFunctionData
      .filter(d => visibleFunctionSeries.has(d.templateId))
      .map(d => d.blockMax);
    return maxes.length > 0 ? Math.max(...maxes) : 10;
  }, [dailyFunctionData, visibleFunctionSeries]);

  // Zeitraum-Navigation
  const handlePreviousTimeRange = () => {
    setTimeRangeOffset(timeRangeOffset - 1);
  };

  const handleNextTimeRange = () => {
    if (timeRangeOffset < 0) setTimeRangeOffset(prev => prev + 1);
  };

  const handleResetTimeRange = () => {
    setTimeRangeOffset(0);
  };

  // Formatiere aktuellen Zeitraum für Anzeige
  const formatCurrentTimeRange = (short: boolean = false): string => {
    const now = new Date();
    
    switch (timeRange) {
      case 'T': {
        // Heute + offset
        const targetDate = new Date(now);
        targetDate.setDate(now.getDate() + timeRangeOffset);
        if (short) {
          return targetDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
        }
        return targetDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      case 'W': {
        // Diese Woche + offset (Montag bis heute)
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        monday.setDate(now.getDate() - daysToMonday + (timeRangeOffset * 7));
        
        // KW berechnen (auf Basis von monday, nicht today)
        const jan1 = new Date(monday.getFullYear(), 0, 1);
        const weekNumber = Math.ceil(
          (((monday.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7
        );
        const sundayOfWeek = new Date(monday);
        sundayOfWeek.setDate(monday.getDate() + 6);
        const mondayStr = monday.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
        const sundayStr = sundayOfWeek.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
        return `KW ${weekNumber} · ${mondayStr}–${sundayStr}`;
      }
      case 'M': {
        // Aktueller Monat + offset
        const targetDate = new Date(now);
        targetDate.setMonth(now.getMonth() + timeRangeOffset);
        if (short) {
          const year = targetDate.getFullYear().toString().slice(-2);
          return targetDate.toLocaleDateString('de-DE', { month: 'short' }) + ' ' + year;
        }
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
              gap: '24px',
              marginTop: '8px'
            }}>
              {/* LINKS: Durchschnitt */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'hsl(var(--foreground))'
              }}>
                <CircleSlash2 size={18} strokeWidth={2.5} style={{ color: '#000000' }} />
                <span style={{ fontSize: '17px', fontWeight: '700' }}>
                  {dailyPainData.length > 0 ? average : '–'}
                </span>
              </div>

              {/* MITTE: < Datum > Navigation */}
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
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
                    color: 'hsl(var(--foreground))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={handleResetTimeRange}
                  disabled={timeRangeOffset === 0}
                  className={styles.dateRangeButton}
                >
                  <span className={styles.dateRangeFull}>{formatCurrentTimeRange(false)}</span>
                  <span className={styles.dateRangeShort}>{formatCurrentTimeRange(true)}</span>
                </button>
                <button
                  onClick={handleNextTimeRange}
                  disabled={timeRangeOffset >= 0}
                  style={{
                    background: 'hsl(var(--secondary))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '14px',
                    cursor: timeRangeOffset >= 0 ? 'default' : 'pointer',
                    color: timeRangeOffset >= 0 ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: timeRangeOffset >= 0 ? 0.4 : 1,
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* RECHTS: Trend */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'hsl(var(--foreground))'
              }}>
                {dailyPainData.length > 0 && (() => {
                  if (trend.text === 'Ohne') {
                    return (
                      <TrendingUpDown size={18} style={{ color: '#000000' }} strokeWidth={2.5} />
                    );
                  }
                  
                  const TrendIcon = trend.icon === '↗' ? ArrowUpRight : trend.icon === '↘' ? ArrowDownRight : ArrowRight;
                  const trendColor = trend.icon === '↗' ? '#ef4444' : trend.icon === '↘' ? '#10b981' : 'hsl(var(--muted-foreground))';
                  
                  return (
                    <>
                      <TrendIcon size={18} style={{ color: trendColor }} strokeWidth={2.5} />
                      {trend.diff && (
                        <span style={{ fontSize: '15px', fontWeight: '700', color: trendColor }}>
                          {trend.diff}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Chart */}
          {dashboardTemplates.length > 0 ? (
            <div className="space-y-3">

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
                  functionSeries={functionApexSeries.length > 0 ? functionApexSeries : undefined}
                  functionYAxisMax={functionYAxisMax}
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

              {/* Template + Funktionswert Toggles */}
              <div className="flex gap-2 flex-wrap justify-center mt-3">
                {dashboardTemplates.map((template, index) => {
                  const isVisible = visibleTemplates.has(template.id!);
                  const key = `template_${template.id}_avg`;
                  const color = chartConfig[key]?.color || getTemplateColor(index, dashboardTemplates.length);
                  const hasFn = dailyFunctionData.some(d => d.templateId === template.id);
                  const isFnActive = visibleFunctionSeries.has(template.id!);
                  const fnEnabled = isVisible && hasFn;

                  return (
                    <div key={template.id} className="flex">
                      {/* Template-Button (linker Teil) */}
                      <Button
                        size="sm"
                        onClick={() => toggleTemplate(template.id!)}
                        title={template.name}
                        style={isVisible
                          ? { backgroundColor: color, borderColor: color, color: '#fff' }
                          : { backgroundColor: 'transparent', borderColor: color, color: color }
                        }
                        className="rounded-r-none border-r-0 h-8 px-2.5"
                      >
                        {React.createElement(getIconComponent(template.icon), { size: 14, strokeWidth: 2 })}
                      </Button>
                      {/* Funktionswert-Button (rechter Teil) */}
                      <Button
                        size="sm"
                        onClick={() => fnEnabled && toggleFunctionSeries(template.id!)}
                        disabled={!fnEnabled}
                        title={hasFn ? `Funktionswert ${template.name}` : `Keine Funktionswerte für ${template.name}`}
                        style={fnEnabled && isFnActive
                          ? { backgroundColor: color, borderColor: color, color: '#fff' }
                          : { backgroundColor: 'transparent', borderColor: color, color: color }
                        }
                        className="rounded-l-none h-8 px-2.5"
                      >
                        <ChartArea size={14} strokeWidth={2} />
                      </Button>
                    </div>
                  );
                })}
              </div>
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
          {filteredEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Events & Arztbesuche</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredEvents.slice(0, 5).map((event, idx) => (
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
                {filteredEvents.length > 5 && (
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    ...und {filteredEvents.length - 5} weitere Events
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {/* Tutorial - DashboardView */}
      <PageTutorial
        page="dashboard"
        steps={[
          {
            spotlight: null,
            text: 'Im Dashboard siehst du deine Schmerzdaten als Diagramm über die Zeit.',
            cardPosition: 'center',
          },
          {
            spotlight: '.dashboard-chart',
            title: 'Verlaufsdiagramm',
            text: 'Hier werden deine Einträge grafisch dargestellt. Den Zeitraum kannst du oben anpassen.',
            cardPosition: 'auto',
          },
        ]}
      />
    </div>
  );
}
