import { useState, useEffect } from 'react';
import { getEntries, getTemplates } from '../db';
import type { Entry, Template } from '../types/database';
import Header from '../components/Header';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, TrendingUp, Activity } from 'lucide-react';
import PainLineChart from '../components/dashboard/PainLineChart';
import { 
  extractPainData, 
  aggregatePainByDay,
  extractEvents,
  getDashboardEnabledTemplates,
  type DailyPainData,
  type EventMarker,
  type PainDataPoint
} from '../utils/dashboardData';

interface DashboardViewLegacyProps {
  onBack: () => void;
  onNavigate: (view: 'editor' | 'history' | 'diary' | 'settings' | 'dashboard') => void;
}

export default function DashboardViewLegacy({ onBack, onNavigate }: DashboardViewLegacyProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '1m' | '3m' | 'all'>('1m');
  
  // Aggregierte Daten
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
  }, [entries, templates, timeRange]);

  async function loadData() {
    try {
      const [allEntries, allTemplates] = await Promise.all([
        getEntries(),
        getTemplates()
      ]);
      
      setEntries(allEntries);
      setTemplates(allTemplates);
      
      // Finde Templates mit Dashboard-Blocks
      const dashTemplates = getDashboardEnabledTemplates(allTemplates);
      setDashboardTemplates(dashTemplates);
      
      // Initialisiere sichtbare Templates (alle aktiviert)
      setVisibleTemplates(new Set(dashTemplates.map(t => t.id!)));
    } catch (error) {
      console.error('Fehler beim Laden der Dashboard-Daten:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function aggregateData() {
    try {
      // Extrahiere ALLE Schmerzwerte (nicht gefiltert)
      const painData = await extractPainData(entries, templates);
      
      // Filtere Schmerzwerte nach Zeitraum (basierend auf DatePicker-Datum!)
      const filteredPainData = filterPainDataByTimeRange(painData, timeRange);
      
      // Aggregiere nach Tag
      const dailyData = aggregatePainByDay(filteredPainData);
      setDailyPainData(dailyData);
      
      // Extrahiere ALLE Events (nicht gefiltert)
      const eventData = await extractEvents(entries, templates);
      
      // Filtere Events nach Zeitraum
      const filteredEvents = filterEventsByTimeRange(eventData, timeRange);
      setEvents(filteredEvents);
      
    } catch (error) {
      console.error('Fehler beim Aggregieren der Daten:', error);
    }
  }
  
  // Hilfsfunktionen zum Filtern nach Zeitraum
  function filterPainDataByTimeRange(data: PainDataPoint[], range: '7d' | '1m' | '3m' | 'all') {
    if (range === 'all') return data;
    
    const now = new Date();
    const cutoffDate = new Date(now);
    
    switch (range) {
      case '7d':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case '1m':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case '3m':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
    }
    
    return data.filter(point => new Date(point.date) >= cutoffDate);
  }
  
  function filterEventsByTimeRange(data: EventMarker[], range: '7d' | '1m' | '3m' | 'all') {
    if (range === 'all') return data;
    
    const now = new Date();
    const cutoffDate = new Date(now);
    
    switch (range) {
      case '7d':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case '1m':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case '3m':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
    }
    
    return data.filter(event => new Date(event.date) >= cutoffDate);
  }

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

  // Gruppiere nach Template für Statistiken
  const templateStats = dashboardTemplates.map(template => {
    const templateData = dailyPainData.filter(d => d.templateId === template.id);
    const allValues = templateData.flatMap(d => [d.min, d.max, d.avg]);
    
    return {
      template,
      dataPoints: templateData.length,
      avgPain: allValues.length > 0 
        ? Math.round((allValues.reduce((a, b) => a + b, 0) / allValues.length) * 10) / 10 
        : 0,
      minPain: allValues.length > 0 ? Math.min(...allValues) : 0,
      maxPain: allValues.length > 0 ? Math.max(...allValues) : 0
    };
  });

  return (
    <div className="app-container">
      <Header 
        title="Dashboard (Legacy)" 
        onBack={onBack}
      />
      
      <div className="content-wrapper">
        <div className="space-y-6">
          {/* Zeitraum-Filter */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={18} className="text-muted-foreground" />
              <h3 className="font-semibold">Zeitraum</h3>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setTimeRange('7d')}
                variant={timeRange === '7d' ? 'default' : 'outline'}
                size="sm"
              >
                7 Tage
              </Button>
              <Button
                onClick={() => setTimeRange('1m')}
                variant={timeRange === '1m' ? 'default' : 'outline'}
                size="sm"
              >
                1 Monat
              </Button>
              <Button
                onClick={() => setTimeRange('3m')}
                variant={timeRange === '3m' ? 'default' : 'outline'}
                size="sm"
              >
                3 Monate
              </Button>
              <Button
                onClick={() => setTimeRange('all')}
                variant={timeRange === 'all' ? 'default' : 'outline'}
                size="sm"
              >
                Gesamt
              </Button>
            </div>
          </Card>

          {/* Statistiken pro Template */}
          {dashboardTemplates.length > 0 && dailyPainData.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Activity size={20} />
                Schmerzverläufe
              </h3>
              
              {/* Schmerzlinien-Chart */}
              <PainLineChart
                data={dailyPainData}
                events={events}
                templates={dashboardTemplates.map(t => ({
                  id: t.id!,
                  name: t.name,
                  color: t.color || '#007AFF'
                }))}
                visibleTemplates={visibleTemplates}
                onVisibleTemplatesChange={setVisibleTemplates}
              />
              
              {/* Template-Statistiken */}
              {templateStats.map(({ template, dataPoints, avgPain, minPain, maxPain }) => (
                <Card key={template.id} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: template.color || '#007AFF' }}
                    >
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
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <TrendingUp size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Noch keine Dashboard-Daten</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Aktiviere Dashboard-Tracking in deinen Templates im Template-Editor.
              </p>
              <Button onClick={() => onNavigate('editor')} variant="outline">
                Zu Templates
              </Button>
            </Card>
          )}

          {/* Events */}
          {events.filter(e => {
            const template = dashboardTemplates.find(t => t.name === e.templateName);
            return template && visibleTemplates.has(template.id!);
          }).length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Events & Arztbesuche</h3>
              <div className="space-y-2">
                {events
                  .filter(e => {
                    const template = dashboardTemplates.find(t => t.name === e.templateName);
                    return template && visibleTemplates.has(template.id!);
                  })
                  .slice(0, 5)
                  .map((event, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-2 bg-secondary/20 rounded">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.date).toLocaleDateString('de-DE')} • {event.templateName}
                      </p>
                      {event.description && (
                        <p className="text-xs mt-1">{event.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {events.filter(e => {
                const template = dashboardTemplates.find(t => t.name === e.templateName);
                return template && visibleTemplates.has(template.id!);
              }).length > 5 && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  ...und {events.filter(e => {
                    const template = dashboardTemplates.find(t => t.name === e.templateName);
                    return template && visibleTemplates.has(template.id!);
                  }).length - 5} weitere Events
                </p>
              )}
            </Card>
          )}

          {/* Debug Info */}
          <Card className="p-4 bg-secondary/10">
            <p className="text-xs text-muted-foreground">
              📊 {entries.length} Einträge gesamt • {dailyPainData.length} Tage mit Daten • {events.length} Events
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
