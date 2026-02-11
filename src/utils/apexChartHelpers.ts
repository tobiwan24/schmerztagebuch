import type { DailyPainData } from './dashboardData';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * ApexCharts Series Format
 */
export interface ApexSeries {
  name: string;
  data: { x: string; y: number }[];
}

/**
 * ChartConfig für Template-Farben
 */
export interface ChartConfig {
  [key: string]: {
    label: string;
    color: string;
  };
}

/**
 * Konvertiert DailyPainData zu ApexCharts Series Format
 * 
 * @param dailyPainData - Aggregierte Schmerzwerte pro Tag
 * @param chartConfig - Template-Konfiguration mit Farben
 * @param visibleTemplates - Set von sichtbaren Template-IDs
 * @returns ApexCharts Series Array
 */
export function convertToApexSeries(
  dailyPainData: DailyPainData[],
  chartConfig: ChartConfig,
  visibleTemplates: Set<number>
): ApexSeries[] {
  // Gruppiere Daten nach Template
  const dataByTemplate = new Map<number, { x: string; y: number }[]>();
  
  dailyPainData.forEach(point => {
    // Nur sichtbare Templates
    if (!visibleTemplates.has(point.templateId)) return;
    
    if (!dataByTemplate.has(point.templateId)) {
      dataByTemplate.set(point.templateId, []);
    }
    
    dataByTemplate.get(point.templateId)!.push({
      x: point.date, // ISO-Date String direkt!
      y: point.avg
    });
  });
  
  // Konvertiere zu ApexCharts Series Format
  const series: ApexSeries[] = [];
  
  dataByTemplate.forEach((data, templateId) => {
    const key = `template_${templateId}_avg`;
    const config = chartConfig[key];
    
    if (config) {
      series.push({
        name: config.label,
        data: data.sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime())
      });
    }
  });
  
  return series;
}

/**
 * Generiert feste Kategorien (X-Achsen Ticks) basierend auf Zeitraum
 * 
 * @param timeRange - Zeitraum (T/W/M/6M/J)
 * @param now - Aktuelles Datum
 * @returns Array von ISO-Date Strings für X-Achse
 */
export function generateCategories(
  timeRange: 'T' | 'W' | 'M' | '6M' | 'J',
  now: Date = new Date()
): string[] {
  const categories: string[] = [];
  
  switch (timeRange) {
    case 'T': {
      // Tag: Heute mit Stunden-Ticks (0h, 8h, 16h, 24h)
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      
      [0, 8, 16, 24].forEach(hour => {
        const date = new Date(today);
        date.setHours(hour);
        categories.push(date.toISOString());
      });
      break;
    }
    
    case 'W': {
      // Woche: Diese Woche (Mo bis heute)
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysToMonday);
      monday.setHours(0, 0, 0, 0);
      
      // Von Montag bis heute
      const daysInWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
      for (let i = 0; i < daysInWeek; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        categories.push(date.toISOString().split('T')[0]);
      }
      break;
    }
    
    case 'M': {
      // Monat: Aktueller Monat (1. bis heute)
      const firstDay = new Date(now);
      firstDay.setDate(1);
      firstDay.setHours(0, 0, 0, 0);
      
      const currentDay = now.getDate();
      
      // Ticks: 1., 5., 10., 15., 20., 25., aktueller Tag (falls > 25)
      const ticks = [1, 5, 10, 15, 20, 25];
      if (currentDay > 25) {
        ticks.push(currentDay);
      }
      
      ticks.forEach(day => {
        if (day <= currentDay) {
          const date = new Date(firstDay);
          date.setDate(day);
          categories.push(date.toISOString().split('T')[0]);
        }
      });
      break;
    }
    
    case '6M': {
      // 6 Monate: Erster Tag jedes Monats über 6 Monate
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now);
        date.setMonth(now.getMonth() - i);
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        categories.push(date.toISOString().split('T')[0]);
      }
      break;
    }
    
    case 'J': {
      // Jahr: Jeden 2. Monat über 12 Monate
      for (let i = 11; i >= 0; i -= 2) {
        const date = new Date(now);
        date.setMonth(now.getMonth() - i);
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        categories.push(date.toISOString().split('T')[0]);
      }
      break;
    }
  }
  
  return categories;
}

/**
 * Formatiert X-Achsen Label basierend auf Zeitraum
 * 
 * @param value - ISO-Date String
 * @param timeRange - Zeitraum (T/W/M/6M/J)
 * @returns Formatierter Label-String
 */
export function formatXAxisLabel(value: string, timeRange: 'T' | 'W' | 'M' | '6M' | 'J'): string {
  const date = new Date(value);
  
  switch (timeRange) {
    case 'T':
      // Tag: 0h, 8h, 16h, 24h
      return `${date.getHours()}h`;
    
    case 'W':
      // Woche: Mo, Di, Mi, Do, Fr, Sa, So
      return format(date, 'EEE', { locale: de });
    
    case 'M':
      // Monat: 1., 5., 10., 15., 20., 25., 31.
      return `${date.getDate()}.`;
    
    case '6M':
      // 6 Monate: Aug, Sep, Okt, Nov, Dez, Jan
      return format(date, 'MMM', { locale: de });
    
    case 'J':
      // Jahr: Jan, Mär, Mai, Jul, Sep, Nov
      return format(date, 'MMM', { locale: de });
    
    default:
      return value;
  }
}

/**
 * Formatiert Tooltip-Datum basierend auf Zeitraum
 * 
 * @param value - ISO-Date String
 * @param timeRange - Zeitraum (T/W/M/6M/J)
 * @returns Formatierter Datum-String für Tooltip
 */
export function formatTooltipDate(value: string, timeRange: 'T' | 'W' | 'M' | '6M' | 'J'): string {
  const date = new Date(value);
  
  switch (timeRange) {
    case 'T':
      return format(date, 'dd. MMM yyyy, HH:mm', { locale: de });
    
    case 'W':
    case 'M':
      return format(date, 'dd. MMM yyyy', { locale: de });
    
    case '6M': {
      // Zeige Woche (Start-Ende)
      const weekEnd = new Date(date);
      weekEnd.setDate(date.getDate() + 6);
      return `${format(date, 'd.', { locale: de })}–${format(weekEnd, 'd. MMM yyyy', { locale: de })}`;
    }
    
    case 'J':
      return format(date, 'MMMM yyyy', { locale: de });
    
    default:
      return format(date, 'dd.MM.yyyy', { locale: de });
  }
}
