import type { Entry, Template } from '../types/database';
import type { Block } from '../types/blocks';

// Datentyp für aggregierte Schmerzwerte
export interface PainDataPoint {
  date: string; // ISO Date String (YYYY-MM-DD)
  timestamp: Date;
  templateId: number;
  templateName: string;
  templateColor: string;
  value: number; // Schmerzwert 0-10
  blockLabel: string;
}

// Datentyp für aggregierte Tageswerte (mit Min/Max/Avg)
export interface DailyPainData {
  date: string; // YYYY-MM-DD
  templateId: number;
  templateName: string;
  templateColor: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

// Event/Arztbesuch Marker
export interface EventMarker {
  date: string; // ISO Date String
  timestamp: Date;
  category: 'event' | 'doctor';
  title: string;
  description?: string;
  templateId: number;
  templateName: string;
}

/**
 * Filtert Entries nach Zeitraum
 */
export function filterEntriesByTimeRange(
  entries: Entry[],
  timeRange: '7d' | '1m' | '3m' | 'all'
): Entry[] {
  if (timeRange === 'all') return entries;
  
  const now = new Date();
  const cutoffDate = new Date(now);
  
  switch (timeRange) {
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
  
  return entries.filter(entry => new Date(entry.timestamp) >= cutoffDate);
}

/**
 * Extrahiert Schmerzwerte aus Entries
 */
export function extractPainData(
  entries: Entry[],
  templates: Template[],
  decryptFn?: (data: string, password: string) => Promise<string>
): Promise<PainDataPoint[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const template = templates.find(t => t.id === entry.templateId);
      if (!template) return [];
      
      let blocks: Block[];
      
      try {
        // Decrypt if needed
        if (entry.encrypted && decryptFn) {
          // TODO: Handle encryption later
          return [];
        } else {
          blocks = JSON.parse(entry.data);
        }
      } catch (error) {
        console.error('Fehler beim Parsen von Entry-Daten:', error);
        return [];
      }
      
      // Finde Datum: DatePicker-Block hat Vorrang, sonst entry.timestamp
      const dateBlock = blocks.find(b => b.type === 'date' && b.value);
      let dates: string[] = [];
      
      if (dateBlock && typeof dateBlock.value === 'string') {
        try {
          // Parse DatePicker value (kann JSON oder einfacher String sein)
          const parsed = JSON.parse(dateBlock.value);
          if (parsed.mode === 'range' && parsed.startDate && parsed.endDate) {
            // Range: Generiere alle Tage zwischen Start und End
            const start = new Date(parsed.startDate);
            const end = new Date(parsed.endDate);
            const current = new Date(start);
            
            while (current <= end) {
              dates.push(current.toISOString().split('T')[0]);
              current.setDate(current.getDate() + 1);
            }
            console.log(`[extractPainData] Range detected: ${parsed.startDate} - ${parsed.endDate}, generated ${dates.length} dates`);
          } else if (parsed.startDate) {
            // Single mode
            dates = [parsed.startDate];
          }
        } catch {
          // Legacy: einfacher String
          dates = [dateBlock.value];
        }
      } else {
        // Fallback: entry.timestamp
        dates = [new Date(entry.timestamp).toISOString().split('T')[0]];
      }
      
      const painPoints: PainDataPoint[] = [];
      
      // Finde alle Blocks mit Dashboard-Konfiguration (pain/function)
      blocks.forEach(block => {
        if (!block.dashboard?.enabled) return;
        
        // Slider oder BodyMap mit numerischem Wert
        if ((block.type === 'slider' || block.type === 'bodymap') && typeof block.value === 'number') {
          // Fallback: Wenn kein type gesetzt, nutze 'pain' als default
          const dashboardType = block.dashboard.type || 'pain';
          if (dashboardType !== 'pain') return; // Nur Schmerzwerte (später auch 'function')
          
          // Für jeden Tag im Zeitraum einen Datenpunkt erstellen
          dates.forEach(date => {
            painPoints.push({
              date,
              timestamp: new Date(date),
              templateId: entry.templateId,
              templateName: template.name,
              templateColor: template.color || '#007AFF',
              value: block.value as number,
              blockLabel: block.label
            });
          });
        }
      });
      
      return painPoints;
    })
  ).then(results => results.flat());
}

/**
 * Aggregiert Schmerzwerte nach Tag und Template
 */
export function aggregatePainByDay(painData: PainDataPoint[]): DailyPainData[] {
  const grouped = new Map<string, PainDataPoint[]>();
  
  // Gruppiere nach "date-templateId"
  painData.forEach(point => {
    const key = `${point.date}-${point.templateId}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(point);
  });
  
  // Berechne Min/Max/Avg für jeden Tag
  const dailyData: DailyPainData[] = [];
  
  grouped.forEach((points, key) => {
    const values = points.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    
    dailyData.push({
      date: points[0].date,
      templateId: points[0].templateId,
      templateName: points[0].templateName,
      templateColor: points[0].templateColor,
      min,
      max,
      avg: Math.round(avg * 10) / 10, // Runde auf 1 Dezimalstelle
      count: points.length
    });
  });
  
  // Sortiere nach Datum
  return dailyData.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Extrahiert Events und Arztbesuche aus Entries
 */
export function extractEvents(
  entries: Entry[],
  templates: Template[]
): Promise<EventMarker[]> {
  return Promise.all(
    entries.map(async (entry) => {
      const template = templates.find(t => t.id === entry.templateId);
      if (!template) return [];
      
      let blocks: Block[];
      
      try {
        if (entry.encrypted) {
          // TODO: Handle encryption later
          return [];
        } else {
          blocks = JSON.parse(entry.data);
        }
      } catch (error) {
        console.error('Fehler beim Parsen von Entry-Daten:', error);
        return [];
      }
      
      // Finde Datum: DatePicker-Block hat Vorrang, sonst entry.timestamp
      const dateBlock = blocks.find(b => b.type === 'date' && b.value);
      let dates: string[] = [];
      
      if (dateBlock && typeof dateBlock.value === 'string') {
        try {
          const parsed = JSON.parse(dateBlock.value);
          if (parsed.mode === 'range' && parsed.startDate && parsed.endDate) {
            // Range: Generiere alle Tage zwischen Start und End
            const start = new Date(parsed.startDate);
            const end = new Date(parsed.endDate);
            const current = new Date(start);
            
            while (current <= end) {
              dates.push(current.toISOString().split('T')[0]);
              current.setDate(current.getDate() + 1);
            }
          } else if (parsed.startDate) {
            dates = [parsed.startDate];
          }
        } catch {
          dates = [dateBlock.value];
        }
      } else {
        dates = [new Date(entry.timestamp).toISOString().split('T')[0]];
      }
      
      const events: EventMarker[] = [];
      
      // Finde alle TextArea-Blocks mit Event-Konfiguration
      blocks.forEach(block => {
        if (!block.dashboard?.enabled) return;
        if (block.type !== 'textarea') return;
        if (!block.dashboard.eventCategory) return;
        
        const title = block.dashboard.eventTitle || block.label;
        const description = typeof block.value === 'string' ? block.value : undefined;
        
        // Für jeden Tag im Zeitraum ein Event erstellen
        dates.forEach(date => {
          events.push({
            date,
            timestamp: new Date(date),
            category: block.dashboard.eventCategory!,
            title,
            description,
            templateId: entry.templateId,
            templateName: template.name
          });
        });
      });
      
      return events;
    })
  ).then(results => results.flat().sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));
}

/**
 * Holt alle Templates die Dashboard-fähige Blocks haben
 */
export function getDashboardEnabledTemplates(templates: Template[]): Template[] {
  return templates.filter(template => 
    template.blocks.some(block => block.dashboard?.enabled)
  );
}
