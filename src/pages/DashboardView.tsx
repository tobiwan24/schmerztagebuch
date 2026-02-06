import { useState, useEffect, useMemo } from 'react';
import { getEntries, getTemplates } from '../db';
import type { Entry, Template } from '../types/database';
import Header from '../components/Header';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, TrendingUp, Activity, CalendarClock, Stethoscope } from 'lucide-react';
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
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

// Vordefinierte Farbpalette für Charts (optimiert für Light & Dark Mode)
const CHART_COLORS = [
  '#3B82F6', // Blau
  '#EF4444', // Rot
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
  // Dynamische Farben mit HSL für Templates > 8
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
  const [timeRange, setTimeRange] = useState<'7d' | '1m' | '3m' | 'all'>('1m');
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
      
      // Adaptive Aggregation: Zeit-basiert
      const aggregatedData = aggregateDataByTimeRange(dailyData, timeRange);
      setDailyPainData(aggregatedData);
      
      const eventData = await extractEvents(entries, templates);
      const filteredEvents = filterEventsByTimeRange(eventData, timeRange);
      setEvents(filteredEvents);
    } catch (error) {
      console.error('Fehler beim Aggregieren der Daten:', error);
    }
  }
  
  function filterPainDataByTimeRange(data: PainDataPoint[], range: '7d' | '1m' | '3m' | 'all') {
    if (range === 'all') return data;
    const now = new Date();
    const cutoffDate = new Date(now);
    switch (range) {
      case '7d': cutoffDate.setDate(now.getDate() - 7); break;
      case '1m': cutoffDate.setMonth(now.getMonth() - 1); break;
      case '3m': cutoffDate.setMonth(now.getMonth() - 3); break;
    }
    return data.filter(point => new Date(point.date) >= cutoffDate);
  }
  
  function filterEventsByTimeRange(data: EventMarker[], range: '7d' | '1m' | '3m' | 'all') {
    if (range === 'all') return data;
    const now = new Date();
    const cutoffDate = new Date(now);
    switch (range) {
      case '7d': cutoffDate.setDate(now.getDate() - 7); break;
      case '1m': cutoffDate.setMonth(now.getMonth() - 1); break;
      case '3m': cutoffDate.setMonth(now.getMonth() - 3); break;
    }
    return data.filter(event => new Date(event.date) >= cutoffDate);
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    
    // Adaptive Formatierung basierend auf timeRange
    if (timeRange === 'all') {
      // Monatlich: "Jan '26"
      return date.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
    } else if (timeRange === '3m') {
      // Wöchentlich: "KW 05"
      const weekNumber = getWeekNumber(date);
      return `KW ${weekNumber}`;
    } else {
      // Täglich: "06.02.26"
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
  };
  
  // Hilfsfunktion: ISO Wochennummer
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // ChartConfig mit vordefinierten Farben
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

  // Chart-Daten vorbereiten
  const allDates = dailyPainData.map(d => d.date).sort();
  const minDate = allDates.length > 0 ? allDates[0] : null;
  const maxDate = allDates.length > 0 ? allDates[allDates.length - 1] : null;
  
  const generateAllDates = (): string[] => {
    if (!minDate || !maxDate) return [];
    const dates: string[] = [];
    const current = new Date(minDate);
    const end = new Date(maxDate);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };
  
  const allDatesInRange = generateAllDates();
  const dataByDate = dailyPainData.reduce((acc, point) => {
    const key = point.date;
    if (!acc.has(key)) acc.set(key, { date: key });
    const entry = acc.get(key)!;
    entry[`template_${point.templateId}_avg`] = point.avg;
    return acc;
  }, new Map<string, Record<string, string | number>>());
  
  // Chart-Daten: Explizit null für fehlende Werte setzen + Event-Daten integrieren
  const chartData = allDatesInRange.map(date => {
    const existing = dataByDate.get(date);
    
    // Basisdaten: Entweder existierend oder leer
    const dayData: Record<string, string | number | null | any> = existing ? { ...existing } : { date };
    
    // Sicherstellen dass ALLE Templates ein Property haben (entweder Wert oder null)
    dashboardTemplates.forEach(template => {
      const key = `template_${template.id}_avg`;
      if (!(key in dayData)) {
        dayData[key] = null;
      }
    });
    
    // Event-Daten hinzufügen
    const dayEvents = events.filter(e => e.date === date && visibleTemplates.has(
      dashboardTemplates.find(t => t.name === e.templateName)?.id ?? 0
    ));
    dayData.events = dayEvents; // Array von EventMarker
    
    return dayData;
  });
  
  // DEBUG: Auskommentiert - Bei Bedarf wieder aktivieren
  // console.log('=== CHART DATA DEBUG ===');
  // console.log('dailyPainData:', dailyPainData);
  // console.log('chartData:', chartData);
  // console.log('dashboardTemplates:', dashboardTemplates);
  // console.log('chartConfig:', chartConfig);

  const toggleTemplate = (templateId: number) => {
    const newVisible = new Set(visibleTemplates);
    if (newVisible.has(templateId)) newVisible.delete(templateId);
    else newVisible.add(templateId);
    setVisibleTemplates(newVisible);
  };

  // Custom Tooltip Component für Event-Details
  const CustomChartTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const data = payload[0].payload; // Datenpunkt mit allen Werten
    const date = data.date;
    const events = data.events || [];
    
    return (
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 border rounded-lg shadow-lg p-3">
        <p className="text-sm font-semibold mb-2">{formatDate(date)}</p>
        
        {/* Schmerzwerte */}
        {payload.map((entry: any) => {
          if (entry.dataKey === 'date' || entry.dataKey === 'events') return null;
          if (entry.value === null) return null;
          
          const template = dashboardTemplates.find(t => `template_${t.id}_avg` === entry.dataKey);
          if (!template) return null;
          
          return (
            <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-sm">{template.name}:</span>
              <span className="text-sm font-medium">{entry.value.toFixed(1)}</span>
            </div>
          );
        })}
        
        {/* Event-Details */}
        {events.length > 0 && (
          <div className="mt-3 pt-2 border-t">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Events:</p>
            {events.map((event: EventMarker, idx: number) => (
              <div key={idx} className="flex items-start gap-2 mb-1">
                {event.category === 'doctor' ? (
                  <Stethoscope size={12} className="text-red-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <CalendarClock size={12} className="text-blue-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-xs font-medium">{event.title}</p>
                  {event.description && (
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Custom Dot-Komponente: NUR Event-Icons (keine sichtbaren Datenpunkte)
  const renderCustomDot = (color: string) => {  
    return (props: any) => {
    const { cx, cy, payload } = props;
    // Bei null-Werten (Tage ohne Daten) keinen Dot rendern
    if (cx === undefined || cy === null || cy === undefined) return null;
    
    // Prüfe ob an diesem Datum Events existieren
    const dateEvents = events.filter(e => {
      const template = dashboardTemplates.find(t => t.name === e.templateName);
      return template && visibleTemplates.has(template.id ?? 0) && e.date === payload.date;
    });
    
    const hasEvent = dateEvents.some((e: EventMarker) => e.category === 'event');
    const hasDoctor = dateEvents.some((e: EventMarker) => e.category === 'doctor');
    const hasAnyEvent = dateEvents.length > 0;
    
    // Wenn keine Events: Keine Dots rendern (ästhetischer)
    if (!hasAnyEvent) return null;
    
    const iconSize = 16; // Etwas größer für bessere Sichtbarkeit
    const iconRadius = iconSize / 2;
    
    console.log('[renderCustomDot] Rendering dot:', { date: payload.date, cx, cy, hasEvent, hasDoctor });
    
    const dotElement = (
      <g key={`dot-${payload.date}`}>
        {/* Unsichtbarer Datenpunkt (r=0) für Positioning */}
        <circle cx={cx} cy={cy} r={0} fill="none" stroke="none" />
        
        {/* Event-Icons DIREKT AUF der Linie (cy position) */}
        {hasAnyEvent && (
          <>
            {hasDoctor && (
              <g key={`doctor-${payload.date}`}>
                <circle 
                  cx={cx} 
                  cy={cy} 
                  r={iconRadius} 
                  fill="#ef4444" 
                  stroke="white" 
                  strokeWidth={2}
                />
                <foreignObject 
                  x={cx - iconRadius} 
                  y={cy - iconRadius} 
                  width={iconSize} 
                  height={iconSize}
                >
                  <div style={{ 
                    width: iconSize, 
                    height: iconSize, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: 'white'
                  }}>
                    <Stethoscope size={10} />
                  </div>
                </foreignObject>
              </g>
            )}
            {hasEvent && !hasDoctor && (
              <g key={`event-${payload.date}`}>
                <circle 
                  cx={cx} 
                  cy={cy} 
                  r={iconRadius} 
                  fill="#3b82f6" 
                  stroke="white" 
                  strokeWidth={2}
                />
                <foreignObject 
                  x={cx - iconRadius} 
                  y={cy - iconRadius} 
                  width={iconSize} 
                  height={iconSize}
                >
                  <div style={{ 
                    width: iconSize, 
                    height: iconSize, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: 'white'
                  }}>
                    <CalendarClock size={10} />
                  </div>
                </foreignObject>
              </g>
            )}
          </>
        )}
      </g>
    );
    
    console.log('[renderCustomDot] Returning element:', dotElement);
    return dotElement;
    };
  };

  const templateStats = dashboardTemplates.map(template => {
    const templateData = dailyPainData.filter(d => d.templateId === template.id);
    const allValues = templateData.flatMap(d => [d.min, d.max, d.avg]);
    return {
      template,
      dataPoints: templateData.length,
      avgPain: allValues.length > 0 ? Math.round((allValues.reduce((a, b) => a + b, 0) / allValues.length) * 10) / 10 : 0,
      minPain: allValues.length > 0 ? Math.min(...allValues) : 0,
      maxPain: allValues.length > 0 ? Math.max(...allValues) : 0
    };
  });

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
        <div className="space-y-6">
          {/* Zeitraum-Filter */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={18} className="text-muted-foreground" />
              <h3 className="font-semibold">Zeitraum</h3>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setTimeRange('7d')} variant={timeRange === '7d' ? 'default' : 'outline'} size="sm">7 Tage</Button>
              <Button onClick={() => setTimeRange('1m')} variant={timeRange === '1m' ? 'default' : 'outline'} size="sm">1 Monat</Button>
              <Button onClick={() => setTimeRange('3m')} variant={timeRange === '3m' ? 'default' : 'outline'} size="sm">3 Monate</Button>
              <Button onClick={() => setTimeRange('all')} variant={timeRange === 'all' ? 'default' : 'outline'} size="sm">Gesamt</Button>
            </div>
          </Card>

          {/* Chart */}
          {dashboardTemplates.length > 0 && dailyPainData.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Activity size={20} />
                Schmerzverläufe
              </h3>
              
              {/* Template Legend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Templates</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {dashboardTemplates.map((template, index) => {
                      const isVisible = visibleTemplates.has(template.id!);
                      const key = `template_${template.id}_avg`;
                      const color = chartConfig[key]?.color || getTemplateColor(index, dashboardTemplates.length);
                      return (
                        <Badge
                          key={template.id}
                          variant={isVisible ? "default" : "outline"}
                          className="cursor-pointer gap-2 px-3 py-1"
                          onClick={() => toggleTemplate(template.id!)}
                          style={isVisible ? { 
                            backgroundColor: color, 
                            borderColor: color,
                            color: '#fff'
                          } : {}}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span>{template.name}</span>
                        </Badge>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Schmerzverläufe</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig}>
                    <LineChart
                      accessibilityLayer
                      data={chartData}
                      margin={{ left: 12, right: 12, top: 20, bottom: 5 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={formatDate}
                        tickLine={false}
                        axisLine={false}
                        angle={-45} 
                        textAnchor="end" 
                        height={80}
                        tickMargin={8}
                        type="category"
                        allowDataOverflow={false}
                      />
                      <YAxis 
                        domain={[0, 10]} 
                        ticks={[0, 2, 4, 6, 8, 10]}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        tickMargin={8}
                      />
                      <ChartTooltip 
                        cursor={false}
                        content={<CustomChartTooltip />} 
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
                            strokeWidth={3}
                            dot={renderCustomDot(color)}
                            connectNulls={true}
                            activeDot={{ r: 6 }}
                            isAnimationActive={false}
                          />
                        );
                      })}
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
              
              {/* Stats */}
              {templateStats.map(({ template, dataPoints, avgPain, minPain, maxPain }, index) => {
                const key = `template_${template.id}_avg`;
                const color = chartConfig[key]?.color || getTemplateColor(index, dashboardTemplates.length);
                return (
                <Card key={template.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ backgroundColor: color }}>
                        {template.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold">{template.name}</h4>
                        <p className="text-xs text-muted-foreground">{dataPoints} Datenpunkte</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Durchschnitt</p>
                        <p className="text-2xl font-bold">{avgPain.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Minimum</p>
                        <p className="text-2xl font-bold text-green-600">{minPain.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Maximum</p>
                        <p className="text-2xl font-bold text-red-600">{maxPain.toFixed(1)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              })}
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
