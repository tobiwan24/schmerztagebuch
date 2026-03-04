import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getEntries, getTemplates } from '../db';
import type { Entry, Template } from '../types/database';
import Header from '../components/Header';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, CircleSlash2, ArrowUpRight, ArrowRight, ArrowDownRight, ChevronLeft, ChevronRight, TrendingUpDown, ChartArea, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadChartPNG, downloadChartPDF, saveChartAsEntry, buildExportFilename } from '../utils/dashboardExport';
import { ApexLineChart } from '../components/charts/ApexLineChart';
import PageTutorial from '../components/tutorial/PageTutorial';
import {
  convertToApexSeries,
  convertFunctionToApexSeries,
  convertToApexSeriesForDay,
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
  type PainDataPoint,
} from '../utils/dashboardData';
import styles from '../styles/DashboardView.module.css';
import { useNavigation } from '../contexts/NavigationContext';
import { getIconComponent } from '../utils/iconUtils';
import { decryptData, decryptWithKey } from '../utils/crypto';
import { getSessionPassword, getSessionKey } from '../utils/auth';
import { getISOWeek } from 'date-fns';

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

  // Decrypt function for encrypted entries (v2 zuerst, Fallback auf v1)
  const decryptFn = useCallback(async (data: string): Promise<string> => {
    const key = await getSessionKey();
    if (key) {
      try {
        return await decryptWithKey(data, key);
      } catch {
        // v1-Format — weiter mit Password-Decrypt
      }
    }
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
  const [rawPainData, setRawPainData] = useState<PainDataPoint[]>([]);
  const [allDailyPainData, setAllDailyPainData] = useState<DailyPainData[]>([]);
  const [events, setEvents] = useState<EventMarker[]>([]);
  const [dashboardTemplates, setDashboardTemplates] = useState<Template[]>([]);
  const [visibleTemplates, setVisibleTemplates] = useState<Set<number>>(new Set());
  const [dailyFunctionData, setDailyFunctionData] = useState<DailyFunctionData[]>([]);
  const [visibleFunctionSeries, setVisibleFunctionSeries] = useState<Set<number>>(new Set());
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportLabel, setExportLabel] = useState('');
  const [exportSelectedTemplateId, setExportSelectedTemplateId] = useState<number>(0);
  const [exportMessage, setExportMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

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
    setDailyPainData([]);
    setRawPainData([]);
    setEvents([]);
    setDailyFunctionData([]);
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
        // Für T-View: rohe Datenpunkte (nicht aggregiert, mit exaktem Timestamp)
        if (timeRange === 'T') {
          if (!cancelled) setRawPainData(filteredPainData);
        } else {
          if (!cancelled) setRawPainData([]);
        }
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
    let startDate: Date;
    let endDate: Date;

    switch (range) {
      case 'T': {
        startDate = new Date(now);
        startDate.setDate(now.getDate() + timeRangeOffset);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'W': {
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - daysToMonday + (timeRangeOffset * 7));
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'M': {
        startDate = new Date(now.getFullYear(), now.getMonth() + timeRangeOffset, 1, 0, 0, 0, 0);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }
      case '6M': {
        startDate = new Date(now.getFullYear(), now.getMonth() - 5 + (timeRangeOffset * 6), 1, 0, 0, 0, 0);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 6, 0, 23, 59, 59, 999);
        break;
      }
      case 'J': {
        startDate = new Date(now.getFullYear(), now.getMonth() - 11 + (timeRangeOffset * 12), 1, 0, 0, 0, 0);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 12, 0, 23, 59, 59, 999);
        break;
      }
      default:
        return data;
    }
    return data.filter(item => {
      const d = new Date(item.date);
      return d >= startDate && d <= endDate;
    });
  }

  const average = useMemo(() => {
    const visibleData = dailyPainData.filter(d => visibleTemplates.has(d.templateId));
    if (visibleData.length === 0) return 0;
    const sum = visibleData.reduce((a, d) => a + d.avg, 0);
    return Math.round((sum / visibleData.length) * 10) / 10;
  }, [dailyPainData, visibleTemplates]);

  const trend = useMemo(
    () => calculateTrendFrom(
      allDailyPainData.filter(d => visibleTemplates.has(d.templateId)),
      timeRange,
      timeRangeOffset
    ),
    [allDailyPainData, visibleTemplates, timeRange, timeRangeOffset]
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
    if (timeRange === 'T') {
      return convertToApexSeriesForDay(
        rawPainData,
        chartConfig,
        visibleTemplates,
        dashboardTemplates.map(t => t.id!)
      );
    }
    return convertToApexSeries(
      dailyPainData, chartConfig, visibleTemplates,
      dashboardTemplates.map(t => t.id!)
    );
  }, [timeRange, rawPainData, dailyPainData, chartConfig, visibleTemplates, dashboardTemplates]);

  const categories = useMemo(() => {
    return generateCategories(timeRange, new Date(), timeRangeOffset);
  }, [timeRange, timeRangeOffset]);

  const toggleTemplate = (templateId: number) => {
    const newVisible = new Set(visibleTemplates);
    if (newVisible.has(templateId)) {
      newVisible.delete(templateId);
      // F-Serie mitdeaktivieren wenn Template ausgeblendet wird
      const newFn = new Set(visibleFunctionSeries);
      newFn.delete(templateId);
      setVisibleFunctionSeries(newFn);
    } else {
      newVisible.add(templateId);
      // F-Serie mitaktivieren wenn Template wieder eingeblendet wird
      const newFn = new Set(visibleFunctionSeries);
      newFn.add(templateId);
      setVisibleFunctionSeries(newFn);
    }
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

  const chartKey = useMemo(() => {
    const templatesKey = [...visibleTemplates].sort().join(',');
    const fnKey = [...visibleFunctionSeries].sort().join(',');
    const seriesType = functionApexSeries.length > 0 ? 'mixed' : 'line';
    return `${timeRange}-${timeRangeOffset}-${seriesType}-t${templatesKey}-f${fnKey}`;
  }, [timeRange, timeRangeOffset, visibleTemplates, visibleFunctionSeries, functionApexSeries]);

  // Template-Farben für ApexCharts (ISS-011: von apexSeries abgeleitet, nicht von visibleTemplates)
  // painColors muss 1:1 mit apexSeries übereinstimmen — auch wenn ein Template keine Daten hat
  const chartColors = useMemo(() => {
    const painColors = apexSeries.map((s) => {
      const template = dashboardTemplates.find(t => t.name === s.name);
      if (!template) return '#ef4444';
      const key = `template_${template.id}_avg`;
      return chartConfig[key]?.color || '#ef4444';
    });

    // Jede aktive Funktionsseries bekommt dieselbe Farbe wie die zugehörige Pain-Series
    const fnColors = functionApexSeries.map(fnSeries => {
      const templateName = fnSeries.name.replace(' · Funktion', '');
      const template = dashboardTemplates.find(t => t.name === templateName);
      if (!template) return painColors[0] ?? '#ef4444';
      const key = `template_${template.id}_avg`;
      return chartConfig[key]?.color || '#ef4444';
    });

    return [...painColors, ...fnColors];
  }, [dashboardTemplates, apexSeries, chartConfig, functionApexSeries]);

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

  const openExportDialog = () => {
    setExportLabel(`Schmerzdiagramm – ${formatCurrentTimeRange(false)}`);
    setExportMessage(null);
    setShowExportDialog(true);
  };

  const handleExportPNG = async () => {
    setExportLoading(true);
    setExportMessage(null);
    try {
      await downloadChartPNG(buildExportFilename('schmerzdiagramm', formatCurrentTimeRange(true), 'png'));
      setExportMessage({ type: 'success', text: 'PNG gespeichert.' });
    } catch {
      setExportMessage({ type: 'error', text: 'PNG-Export fehlgeschlagen.' });
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportPDF = async () => {
    setExportLoading(true);
    setExportMessage(null);
    try {
      await downloadChartPDF(
        exportLabel,
        buildExportFilename('schmerzdiagramm', formatCurrentTimeRange(true), 'pdf')
      );
      setExportMessage({ type: 'success', text: 'PDF gespeichert.' });
    } catch {
      setExportMessage({ type: 'error', text: 'PDF-Export fehlgeschlagen.' });
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportToDb = async () => {
    setExportLoading(true);
    setExportMessage(null);
    try {
      await saveChartAsEntry(exportSelectedTemplateId, exportLabel);
      setExportMessage({ type: 'success', text: 'Als Eintrag gespeichert.' });
    } catch {
      setExportMessage({ type: 'error', text: 'Speichern fehlgeschlagen.' });
    } finally {
      setExportLoading(false);
    }
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
        
        // KW berechnen nach ISO 8601 (DE-Standard)
        const weekNumber = getISOWeek(monday);
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
        // 6 Monate + offset — End-Datum aus Periodenende berechnen (BUG-C)
        const start = new Date(now);
        start.setMonth(now.getMonth() - 5 + (timeRangeOffset * 6));
        start.setDate(1);
        const end = new Date(start);
        end.setMonth(start.getMonth() + 5);
        const startMonth = start.toLocaleDateString('de-DE', { month: 'short' });
        const endMonth = end.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
        return `${startMonth}–${endMonth}`;
      }
      case 'J': {
        // 12 Monate + offset — End-Datum aus Periodenende berechnen (BUG-C)
        const start = new Date(now);
        start.setMonth(now.getMonth() - 11 + (timeRangeOffset * 12));
        start.setDate(1);
        const end = new Date(start);
        end.setMonth(start.getMonth() + 11);
        const startMonth = start.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
        const endMonth = end.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
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
                  key={chartKey}
                  series={apexSeries}
                  categories={categories}
                  timeRange={timeRange}
                  colors={chartColors}
                  height={350}
                  events={events}
                  visibleTemplates={visibleTemplates}
                  dashboardTemplates={dashboardTemplates}
                  functionSeries={functionApexSeries.length > 0 ? functionApexSeries : undefined}
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

              {/* Export-Button */}
              <div className="flex justify-center mt-2">
                <Button variant="outline" size="sm" onClick={openExportDialog} className="gap-1.5">
                  <Download size={14} />
                  Exportieren
                </Button>
              </div>

              {/* Template + Funktionswert Toggles */}
              <div className="flex gap-2 flex-wrap justify-center mt-3">
                {dashboardTemplates.map((template, index) => {
                  const isVisible = visibleTemplates.has(template.id!);
                  const key = `template_${template.id}_avg`;
                  const color = chartConfig[key]?.color || getTemplateColor(index, dashboardTemplates.length);
                  const hasConfiguredFn = template.blocks.some(
                    b => b.type === 'slider' && b.dashboard?.enabled && b.dashboard.type === 'function'
                  );
                  const hasFnData = dailyFunctionData.some(d => d.templateId === template.id);
                  const isFnActive = visibleFunctionSeries.has(template.id!);
                  const fnEnabled = isVisible && hasFnData;

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
                        className={hasConfiguredFn ? "rounded-r-none border-r-0 h-8 px-2.5" : "h-8 px-2.5"}
                      >
                        {React.createElement(getIconComponent(template.icon), { size: 14, strokeWidth: 2 })}
                      </Button>
                      {/* Funktionswert-Button (rechter Teil) — nur wenn Template function-Slider hat */}
                      {hasConfiguredFn && (
                        <Button
                          size="sm"
                          onClick={() => fnEnabled && toggleFunctionSeries(template.id!)}
                          disabled={!fnEnabled}
                          title={hasFnData ? `Funktionswert ${template.name}` : `Keine Funktionswerte für ${template.name}`}
                          style={fnEnabled && isFnActive
                            ? { backgroundColor: color, borderColor: color, color: '#fff' }
                            : { backgroundColor: 'transparent', borderColor: color, color: color }
                          }
                          className="rounded-l-none h-8 px-2.5"
                        >
                          <ChartArea size={14} strokeWidth={2} />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
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
      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chart exportieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="export-label">Titel / Bezeichnung</Label>
              <Input
                id="export-label"
                value={exportLabel}
                onChange={e => setExportLabel(e.target.value)}
                placeholder="z. B. Schmerzdiagramm – März 2026"
              />
            </div>

            {/* PNG + PDF */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Herunterladen</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={handleExportPNG}
                  disabled={exportLoading}
                >
                  <Download size={13} />
                  PNG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={handleExportPDF}
                  disabled={exportLoading}
                >
                  <Download size={13} />
                  PDF
                </Button>
              </div>
            </div>

            {/* Als Eintrag speichern */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">In Datenbank speichern</p>
              <select
                value={exportSelectedTemplateId}
                onChange={e => setExportSelectedTemplateId(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={0}>Allgemeiner Eintrag</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <Button
                className="w-full gap-1.5"
                size="sm"
                onClick={handleExportToDb}
                disabled={exportLoading}
              >
                Als Eintrag speichern
              </Button>
            </div>

            {exportMessage && (
              <p className={`text-sm ${exportMessage.type === 'error' ? 'text-destructive' : 'text-green-600'}`}>
                {exportMessage.text}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
