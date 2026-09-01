// Dashboard Export Utilities
// PNG/PDF Download und DB-Eintrag speichern

import ApexCharts from 'apexcharts';
import jsPDF from 'jspdf';
import { createEntry } from '../db';
import { encryptWithKey } from './crypto';
import { getEncryptionMode, getSessionKey, refreshSession } from './auth';
import { generateUUID } from './uuid';
import { getCloudEncryptionKey } from './entryEncryption';
import type { Block } from '../types/blocks';

const CHART_ID = 'pain-chart-poc';
/** ID der versteckten Chart-Instanz in HistoryView, nur für PDF-Dashboard-Layout-Export (RDM-019). */
export const EXPORT_CHART_ID = 'pain-chart-export';

export async function getChartDataURI(chartId: string = CHART_ID): Promise<string> {
  // WICHTIG: exec(..., opts) via rest-param → {scale:2} direkt übergeben, KEIN Array-Wrapper
  // Array-Wrapper würde options.scale = undefined → scale = NaN → korruptes 300×150-Bild erzeugen
  const result = await ApexCharts.exec(chartId, 'dataURI', { scale: 2 }) as
    | { imgURI: string; blob?: undefined }
    | { blob: Blob; imgURI?: undefined }
    | null;

  if (!result) throw new Error(`Chart-Instanz nicht gefunden (ID: ${chartId})`);

  if (result.imgURI) return result.imgURI;

  // Edge-Legacy-Fallback: msToBlob → Blob → DataURL
  if (result.blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(result.blob!);
    });
  }

  throw new Error('dataURI-Export fehlgeschlagen: kein imgURI und kein blob');
}

export async function downloadChartPNG(filename: string): Promise<void> {
  const imgURI = await getChartDataURI();
  const a = document.createElement('a');
  a.href = imgURI;
  a.download = filename;
  a.click();
}

export async function downloadChartPDF(title: string, filename: string): Promise<void> {
  const imgURI = await getChartDataURI();
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setFontSize(13);
  pdf.text(title, 14, 14);
  // A4 landscape: 297×210mm, margins: links/rechts 14mm, oben 22mm
  pdf.addImage(imgURI, 'PNG', 14, 22, 269, 148);
  pdf.save(filename);
}

export async function saveChartAsEntry(templateId: number, label: string): Promise<void> {
  const imgURI = await getChartDataURI();

  const block: Block = {
    id: generateUUID(),
    type: 'textarea',
    label,
    value: {
      attachedFiles: [{
        id: generateUUID(),
        name: `${label}.png`,
        type: 'image',
        data: imgURI,
        createdAt: new Date().toISOString(),
      }],
    },
  };

  let data = JSON.stringify([block]);
  let encrypted = false;
  let encryptionVersion: number | undefined;
  let encryptionSource: 'cloud' | 'local' | undefined;

  // Cloud-DEK hat Vorrang vor der lokalen Passwort-Verschlüsselung (siehe utils/entryEncryption.ts).
  const cloudKey = await getCloudEncryptionKey();
  if (cloudKey) {
    data = await encryptWithKey(data, cloudKey);
    encrypted = true;
    encryptionVersion = 2;
    encryptionSource = 'cloud';
  } else {
    const encMode = await getEncryptionMode();
    if (encMode === 'full') {
      const key = await getSessionKey();
      if (key) {
        refreshSession();
        data = await encryptWithKey(data, key);
        encrypted = true;
        encryptionVersion = 2;
        encryptionSource = 'local';
      }
    }
  }

  await createEntry(templateId, [block], encrypted, encryptionVersion, encryptionSource, data);
}

export function buildExportFilename(
  prefix: string,
  timeRangeLabel: string,
  ext: 'png' | 'pdf'
): string {
  const date = new Date().toISOString().slice(0, 10);
  const safe = timeRangeLabel.replace(/[^a-zA-Z0-9äöüÄÖÜ-]/g, '_').toLowerCase();
  return `${prefix}-${date}-${safe}.${ext}`;
}
