import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Scatter
} from 'recharts';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DailyPainData, EventMarker } from '../../utils/dashboardData';
import { useState } from 'react';
import { CalendarClock, Stethoscope } from 'lucide-react';

interface PainLineChartProps {
  data: DailyPainData[];
  events: EventMarker[];
  templates: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  visibleTemplates: Set<number>;
  onVisibleTemplatesChange: (visible: Set<number>) => void;
}

export default function PainLineChart({ data, events, templates, visibleTemplates, onVisibleTemplatesChange }: PainLineChartProps) {

  // Berechne Datumsbereich und generiere alle Tage
  const allDates = data.map(d => d.date).sort();
  const minDate = allDates.length > 0 ? allDates[0] : null;
  const maxDate = allDates.length > 0 ? allDates[allDates.length - 1] : null;
  
  // Generiere alle Tage zwischen min und max
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

  // Gruppiere Daten nach Datum für Chart
  const dataByDate = data.reduce((acc, point) => {
    const key = point.date;
    if (!acc.has(key)) {
      acc.set(key, { date: key });
    }
    const entry = acc.get(key)!;
    
    // Füge Template-spezifische Werte hinzu
    entry[`template_${point.templateId}_avg`] = point.avg;
    entry[`template_${point.templateId}_min`] = point.min;
    entry[`template_${point.templateId}_max`] = point.max;
    
    return acc;
  }, new Map<string, any>());
  
  // Erstelle Chart-Daten mit ALLEN Tagen (auch leere)
  const chartData = allDatesInRange.map(date => {
    return dataByDate.get(date) || { date };
  });

  // Event-Daten für Scatter-Punkte vorbereiten - NUR für sichtbare Templates
  const eventScatterData = chartData.map(point => {
    const dateEvents = events.filter(e => {
      // Nur Events von sichtbaren Templates zeigen
      const template = templates.find(t => t.name === e.templateName);
      return template && visibleTemplates.has(template.id) && e.date === point.date;
    });
    
    // Finde höchsten Schmerzwert an diesem Tag (nur sichtbare Templates)
    let maxValue = 0;
    templates.forEach(template => {
      if (!visibleTemplates.has(template.id)) return;
      const key = `template_${template.id}_avg`;
      if (point[key] !== undefined) {
        maxValue = Math.max(maxValue, point[key]);
      }
    });
    
    // Events auch anzeigen wenn KEIN Schmerzwert (value = 5 als Fallback für reine Events)
    const hasEvents = dateEvents.length > 0;
    
    return {
      date: point.date,
      value: maxValue > 0 ? maxValue : (hasEvents ? 5 : null), // Fallback auf Mitte wenn nur Events
      events: dateEvents,
      hasEvent: dateEvents.some(e => e.category === 'event'),
      hasDoctor: dateEvents.some(e => e.category === 'doctor')
    };
  }).filter(p => p.value !== null);

  const toggleTemplate = (templateId: number) => {
    const newVisible = new Set(visibleTemplates);
    if (newVisible.has(templateId)) {
      newVisible.delete(templateId);
    } else {
      newVisible.add(templateId);
    }
    onVisibleTemplatesChange(newVisible);
  };

  // Formatiere Datum für Tooltip
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit',
      year: '2-digit'
    });
  };

  // Custom Tooltip - nur Event-Titel
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const dateEvents = events.filter(e => e.date === label);
    
    // Nur anzeigen wenn Events vorhanden sind
    if (dateEvents.length === 0) return null;

    return (
      <Card className="p-2 shadow-lg">
        {dateEvents.map((event, idx) => (
          <div key={idx} className="flex items-center gap-1 text-xs">
            {event.category === 'doctor' ? (
              <Stethoscope size={10} />
            ) : (
              <CalendarClock size={10} />
            )}
            <span>{event.title}</span>
          </div>
        ))}
      </Card>
    );
  };

  // Custom Event Icon Renderer
  const renderEventIcon = (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload || !payload.events || payload.events.length === 0) return null;

    const iconSize = 16;
    const spacing = 18;
    
    return (
      <g>
        {payload.hasDoctor && (
          <foreignObject
            x={cx - iconSize / 2}
            y={cy - spacing - iconSize}
            width={iconSize}
            height={iconSize}
          >
            <div style={{ 
              width: iconSize, 
              height: iconSize, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: '#ef4444',
              borderRadius: '50%',
              color: 'white'
            }}>
              <Stethoscope size={10} />
            </div>
          </foreignObject>
        )}
        {payload.hasEvent && (
          <foreignObject
            x={cx - iconSize / 2}
            y={cy - (payload.hasDoctor ? spacing * 2 : spacing) - iconSize}
            width={iconSize}
            height={iconSize}
          >
            <div style={{ 
              width: iconSize, 
              height: iconSize, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: '#3b82f6',
              borderRadius: '50%',
              color: 'white'
            }}>
              <CalendarClock size={10} />
            </div>
          </foreignObject>
        )}
      </g>
    );
  };

  if (chartData.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Keine Daten zum Anzeigen</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legende mit Toggle */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3">Templates</h4>
        <div className="flex flex-wrap gap-2">
          {templates.map(template => {
            const isVisible = visibleTemplates.has(template.id);
            return (
              <Button
                key={template.id}
                onClick={() => toggleTemplate(template.id)}
                variant={isVisible ? "default" : "outline"}
                size="sm"
                className="gap-2"
                style={isVisible ? { backgroundColor: template.color } : {}}
              >
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: template.color }}
                />
                <span>{template.name}</span>
              </Button>
            );
          })}
        </div>
      </Card>

      {/* Chart */}
      <Card className="p-2">
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData} margin={{ left: -20, right: 10, top: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis 
              domain={[0, 10]} 
              ticks={[0, 2, 4, 6, 8, 10]}
              width={35}
              label={{ value: 'Schmerzstärke', angle: -90, position: 'insideLeft', offset: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Linien für jedes Template */}
            {templates.map(template => {
              if (!visibleTemplates.has(template.id)) return null;
              
              return (
                <Line
                  key={template.id}
                  type="monotone"
                  dataKey={`template_${template.id}_avg`}
                  stroke={template.color}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name={template.name}
                />
              );
            })}

            {/* Event-Icons als Scatter */}
            <Scatter
              data={eventScatterData}
              dataKey="value"
              shape={renderEventIcon}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
