import type { DailyPainData, DailyFunctionData, PainDataPoint } from './dashboardData';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Lokales Datum als ISO-Date-String (YYYY-MM-DD).
 * Verhindert UTC±Offset-Fehler (toISOString würde UTC liefern).
 */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * ApexCharts Series Format
 */
export interface ApexSeries {
  name: string;
  data: { x: number; y: number }[];
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
  visibleTemplates: Set<number>,
  orderedTemplateIds?: number[]
): ApexSeries[] {
  // Gruppiere Daten nach Template
  const dataByTemplate = new Map<number, { x: number; y: number }[]>();

  dailyPainData.forEach(point => {
    // Nur sichtbare Templates
    if (!visibleTemplates.has(point.templateId)) return;

    if (!dataByTemplate.has(point.templateId)) {
      dataByTemplate.set(point.templateId, []);
    }

    dataByTemplate.get(point.templateId)!.push({
      x: new Date(point.date).getTime(), // ms (UTC midnight des Datums)
      y: point.avg
    });
  });

  // Konvertiere zu ApexCharts Series Format — in definierter Reihenfolge (BUG-B)
  // Alle sichtbaren Templates einschließen — auch ohne Daten (leeres Board mit statischen Achsen)
  const ids = orderedTemplateIds
    ? orderedTemplateIds.filter(id => visibleTemplates.has(id))
    : [...dataByTemplate.keys()];

  return ids.map(templateId => {
    const key = `template_${templateId}_avg`;
    const config = chartConfig[key];
    const data = dataByTemplate.get(templateId) ?? [];
    return {
      name: config?.label ?? String(templateId),
      data: data.sort((a, b) => a.x - b.x),
    };
  });
}

/**
 * Konvertiert DailyFunctionData zu ApexCharts Series Format (für Stepline-Area)
 */
export function convertFunctionToApexSeries(
  functionData: DailyFunctionData[],
  chartConfig: ChartConfig,
  visibleFunctionSeries: Set<number>
): ApexSeries[] {
  const dataByTemplate = new Map<number, { x: number; y: number }[]>();

  functionData.forEach(point => {
    if (!visibleFunctionSeries.has(point.templateId)) return;
    if (!dataByTemplate.has(point.templateId)) {
      dataByTemplate.set(point.templateId, []);
    }
    dataByTemplate.get(point.templateId)!.push({
      x: new Date(point.date).getTime(), // ms
      y: point.value,
    });
  });

  const series: ApexSeries[] = [];

  dataByTemplate.forEach((data, templateId) => {
    const key = `template_${templateId}_avg`;
    const config = chartConfig[key];
    if (config) {
      series.push({
        name: `${config.label} · Funktion`,
        data: data.sort((a, b) => a.x - b.x),
      });
    }
  });

  return series;
}

/**
 * Konvertiert rohe PainDataPoints zu ApexSeries für T-View (Tagesansicht).
 * Verwendet exakte Entry-Timestamps statt Tages-Aggregate.
 * Kein aggregatePainByDay() → jeder Eintrag erscheint als eigener Punkt.
 */
export function convertToApexSeriesForDay(
  rawPainData: PainDataPoint[],
  chartConfig: ChartConfig,
  visibleTemplates: Set<number>,
  orderedTemplateIds?: number[]
): ApexSeries[] {
  const dataByTemplate = new Map<number, { x: number; y: number }[]>();

  rawPainData.forEach(point => {
    if (!visibleTemplates.has(point.templateId)) return;
    if (!dataByTemplate.has(point.templateId)) {
      dataByTemplate.set(point.templateId, []);
    }
    dataByTemplate.get(point.templateId)!.push({
      x: point.datetime, // exakte Uhrzeit als ms
      y: point.value,    // Rohwert (kein Durchschnitt)
    });
  });

  const ids = orderedTemplateIds
    ? orderedTemplateIds.filter(id => visibleTemplates.has(id))
    : [...dataByTemplate.keys()];

  return ids.map(templateId => {
    const key = `template_${templateId}_avg`;
    const config = chartConfig[key];
    const data = dataByTemplate.get(templateId) ?? [];
    return {
      name: config?.label ?? String(templateId),
      data: data.sort((a, b) => a.x - b.x),
    };
  });
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
  now: Date = new Date(),
  offset: number = 0
): string[] {
  const categories: string[] = [];

  switch (timeRange) {
    case 'T': {
      // Tag: Heute + offset mit Stunden-Ticks (0h, 4h, 8h, 12h, 16h, 20h, 24h)
      const today = new Date(now);
      today.setDate(now.getDate() + offset);
      today.setHours(0, 0, 0, 0);

      [0, 4, 8, 12, 16, 20].forEach(hour => {
        const d = new Date(today);
        d.setHours(hour, 0, 0, 0);
        categories.push(d.toISOString());
      });
      // "24h" = Mitternacht des Folgetags
      const endOfDay = new Date(today);
      endOfDay.setDate(today.getDate() + 1);
      endOfDay.setHours(0, 0, 0, 0);
      categories.push(endOfDay.toISOString());
      break;
    }
    
    case 'W': {
      // Woche: Diese Woche + offset (Mo bis So; bei aktueller Woche nur bis heute)
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysToMonday + (offset * 7));
      monday.setHours(0, 0, 0, 0);

      // Immer alle 7 Tage zeigen — fehlende Datenpunkte der Zukunft bleiben leer
      const daysToShow = 7;
      for (let i = 0; i < daysToShow; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        categories.push(localDateStr(date));
      }
      break;
    }
    
    case 'M': {
      // Monat: Angezeigter Monat + offset — immer ganzer Monat (1. bis letzter Tag)
      const firstDay = new Date(now);
      firstDay.setMonth(now.getMonth() + offset);
      firstDay.setDate(1);
      firstDay.setHours(0, 0, 0, 0);

      // Letzter Tag des angezeigten Monats (nicht aktueller Monat)
      const lastDayDate = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
      const lastDay = lastDayDate.getDate(); // 28, 29, 30 oder 31

      // Ticks: 1., 5., 10., 15., 20., 25., letzter Tag (falls > 25)
      const ticks = [1, 5, 10, 15, 20, 25];
      if (lastDay > 25) ticks.push(lastDay);

      ticks.forEach(day => {
        const date = new Date(firstDay);
        date.setDate(day);
        categories.push(localDateStr(date));
      });
      break;
    }
    
    case '6M': {
      // 6 Monate: Erster Tag jedes Monats über 6 Monate + offset
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now);
        date.setMonth(now.getMonth() - i + (offset * 6));
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        categories.push(localDateStr(date));
      }
      break;
    }

    case 'J': {
      // Jahr: Alle 12 Monate + offset
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now);
        date.setMonth(now.getMonth() - i + (offset * 12));
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        categories.push(localDateStr(date));
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
export function formatXAxisLabel(
  value: string,
  timeRange: 'T' | 'W' | 'M' | '6M' | 'J',
  categories?: string[]
): string {
  const date = new Date(value);

  switch (timeRange) {
    case 'T': {
      const hour = date.getHours();
      // "24h"-Tick: Mitternacht des Folgetags = letzter Eintrag in categories mit hour=0
      if (hour === 0 && categories && categories.length > 0 && value === categories[categories.length - 1]) {
        return '24h';
      }
      return `${hour}h`;
    }

    case 'W':
      // Woche: Mo, Di, Mi, Do, Fr, Sa, So
      return format(date, 'EEE', { locale: de });

    case 'M':
      // Monat: 1., 5., 10., 15., 20., 25., 31.
      return `${date.getDate()}.`;

    case '6M':
      // 6 Monate: numerisch 01–12
      return format(date, 'MM', { locale: de });

    case 'J':
      // Jahr: numerisch 01–12
      return format(date, 'MM', { locale: de });

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
