import jsPDF from 'jspdf';
import type { Entry, Template } from '../types/database';
import type { Block, TextAreaBlockValue } from '../types/blocks';

interface PainPoint {
  x: number;
  y: number;
  intensity: number;
  diameter: number;
  comment: string;
  type: 'point' | 'brush';
  path?: { x: number; y: number }[];
  number: number;
}

interface BodyMapData {
  image: string;
  points: PainPoint[];
}

/**
 * Rendert eine BodyMap mit allen Schmerzpunkten zu einem Bild
 */
async function renderBodyMapToImage(data: BodyMapData): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context nicht verfügbar'));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const cw = canvas.width;
      const ch = canvas.height;

      function getColorForIntensity(intensity: number): string {
        if (intensity <= 3) return '#22c55e';
        if (intensity <= 6) return '#eab308';
        if (intensity <= 8) return '#f97316';
        return '#ef4444';
      }

      data.points.forEach(point => {
        const color = getColorForIntensity(point.intensity);
        const px = point.x * cw;
        const py = point.y * ch;
        const radius = (point.diameter * cw) / 2;
        const fontSize = Math.max(12, Math.min(20, radius * 0.9));

        if (point.type === 'brush' && point.path && point.path.length > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(point.path[0].x * cw, point.path[0].y * ch);
          for (let i = 1; i < point.path.length; i++) {
            ctx.lineTo(point.path[i].x * cw, point.path[i].y * ch);
          }
          ctx.strokeStyle = color + '80';
          ctx.lineWidth = radius * 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = 'white';
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText(`#${point.number}`, px, py);
          ctx.fillText(`#${point.number}`, px, py);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, radius + 5, 0, 2 * Math.PI);
          ctx.fillStyle = color + '40';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(px, py, radius, 0, 2 * Math.PI);
          ctx.fillStyle = color + 'CC';
          ctx.fill();

          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = 'white';
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText(`#${point.number}`, px, py);
          ctx.fillText(`#${point.number}`, px, py);
        }
      });

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = data.image;
  });
}

export type ImageSize = 'a6' | 'a5' | 'a4' | 'none';
export type PdfLayout = 'table' | 'cards' | 'dashboard';

const IMAGE_SIZE_MM: Record<Exclude<ImageSize, 'none'>, { w: number; h: number }> = {
  a6: { w: 105, h: 148 },
  a5: { w: 148, h: 210 },
  a4: { w: 210, h: 297 },
};

interface PDFExportOptions {
  entries: Entry[];
  templates: Template[];
  decryptedData: Map<number, Block[]>;
  startDate?: string;
  endDate?: string;
  selectedTemplate?: string;
  imageSize?: ImageSize;
  password?: string;
  layout?: PdfLayout;
  selectedMultiselects?: string[];
  chartImageUri?: string;
}

interface ImageAttachment {
  entryId: number;
  entryTitle: string;
  entryDate: string;
  blockLabel: string;
  imageData: string;
  type: 'bodymap' | 'image';
}

// Sync: Block-Wert als kompakten String für Tabellenzelle formatieren
function formatCellValue(block: Block): string {
  switch (block.type) {
    case 'text':
      return String(block.value || '—');

    case 'textarea': {
      if (block.value && typeof block.value === 'object') {
        const tv = block.value as TextAreaBlockValue;
        return tv.text?.trim() || '—';
      }
      return String(block.value || '—');
    }

    case 'slider':
      return block.value !== undefined && block.value !== null ? String(block.value) : '—';

    case 'date': {
      if (!block.value) return '—';
      const raw = String(block.value);
      try {
        const p = JSON.parse(raw) as {
          mode: string; startDate: string; endDate?: string;
          time?: string; startTime?: string; endTime?: string;
        };
        const fmtDate = (d: string) =>
          new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
        if (p.mode === 'range' && p.endDate) {
          const start = fmtDate(p.startDate) + (p.startTime ? ` ${p.startTime}` : '');
          const end = fmtDate(p.endDate) + (p.endTime ? ` ${p.endTime}` : '');
          return `${start} –\n${end}`;
        }
        return fmtDate(p.startDate) + (p.time ? ` ${p.time}` : '');
      } catch {
        return new Date(raw + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      }
    }

    case 'checkbox':
      return block.value ? 'Ja' : 'Nein';

    case 'multiselect':
      return Array.isArray(block.value) && block.value.length > 0
        ? block.value.join(', ')
        : '—';

    default:
      return String(block.value || '—');
  }
}

// Eintragsdatum kompakt formatieren (zwei Zeilen: Datum + Uhrzeit)
function formatEntryDate(timestamp: Date): string {
  const d = new Date(timestamp);
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${date}\n${time}`;
}

interface RowData {
  entry: Entry;
  dateText: string;
  cellTexts: string[];
}

interface GroupData {
  template: Template | undefined;
  columns: Block[];
  legacyStart: number; // index ab dem Spalten aus alten Einträgen kommen (Legacy)
  rows: RowData[];
}

/**
 * Exportiert gefilterte Einträge als PDF — Layout je nach options.layout
 */
export async function exportToPDF(options: PDFExportOptions): Promise<void> {
  const layout = options.layout ?? 'table';
  if (layout === 'cards') return renderCardsLayout(options);
  if (layout === 'dashboard') return renderDashboardLayout(options);

  // ── TABLE LAYOUT ─────────────────────────────────────────────────────────
  const {
    entries, templates, decryptedData,
    startDate, endDate, selectedTemplate,
    imageSize = 'a5', password = '',
  } = options;

  // Querformat A4
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfOptions: any = { orientation: 'landscape', unit: 'mm', format: 'a4' };
  if (password) {
    pdfOptions.encryption = {
      userPassword: password,
      ownerPassword: password + '_owner',
      userPermissions: ['print', 'copy'],
    };
  }
  const doc = new jsPDF(pdfOptions);

  const pageWidth  = doc.internal.pageSize.getWidth();   // 297 mm
  const pageHeight = doc.internal.pageSize.getHeight();  // 210 mm
  const margin       = 15;
  const contentWidth = pageWidth - 2 * margin;           // 267 mm
  const dateColW     = 38;                               // Datumsspalte fix
  let yPosition = margin;

  const imageAttachments: ImageAttachment[] = [];

  // ── PRE-PASS: Einträge gruppieren + Zellinhalte vorberechnen ─────────────
  // entries kommt sortiert aus HistoryView.visibleEntries
  const orderedGroups = new Map<number | undefined, Entry[]>();
  for (const entry of entries) {
    const key = entry.templateId ?? undefined;
    if (!orderedGroups.has(key)) orderedGroups.set(key, []);
    orderedGroups.get(key)!.push(entry);
  }

  const groups: GroupData[] = [];

  for (const [templateId, groupEntries] of orderedGroups) {
    const template = templates.find(t => t.id === templateId);

    // Haupt-Spalten aus Template (ohne text-Blöcke), Fallback auf ersten Eintrag
    // date-Blöcke werden ausgeschlossen — ihr Wert erscheint bereits in der eigenen Datumsspalte,
    // sonst würde das Datum doppelt auftauchen.
    const mainColumns: Block[] = (template
      ? template.blocks
      : (decryptedData.get(groupEntries[0].id!) ?? [])
    ).filter(b => b.type !== 'text' && b.type !== 'date');

    // Legacy-Spalten: in Einträgen vorhanden, aber nicht mehr im Template
    const knownIds    = new Set(mainColumns.map(b => b.id));
    const knownLabels = new Set(mainColumns.map(b => b.label));
    const legacyMap   = new Map<string, Block>(); // label → Block
    for (const entry of groupEntries) {
      for (const b of decryptedData.get(entry.id!) ?? []) {
        if (b.type === 'text' || b.type === 'date') continue;
        if (knownIds.has(b.id) || knownLabels.has(b.label)) continue;
        if (!legacyMap.has(b.label)) {
          legacyMap.set(b.label, b);
          knownLabels.add(b.label);
        }
      }
    }
    const legacyColumns = Array.from(legacyMap.values());
    const columns       = [...mainColumns, ...legacyColumns];
    const legacyStart   = mainColumns.length;

    const rows: RowData[] = [];
    for (const entry of groupEntries) {
      if (!entry.id) continue;
      const entryBlocks  = decryptedData.get(entry.id) ?? [];
      const dateText     = formatEntryDate(entry.timestamp);
      const entryTitle   = template?.name ?? 'Unbekannt';
      const entryDateStr = new Date(entry.timestamp).toLocaleString('de-DE');

      const cellTexts: string[] = [];

      for (let ci = 0; ci < columns.length; ci++) {
        const col      = columns[ci];
        const isLegacy = ci >= legacyStart;
        const block    = isLegacy
          ? entryBlocks.find(b => b.label === col.label)
          : (entryBlocks.find(b => b.id === col.id) ?? entryBlocks.find(b => b.label === col.label));

        if (!block) { cellTexts.push('—'); continue; }

        // BodyMap (async: Canvas rendern)
        if (block.type === 'bodymap' && block.value && typeof block.value === 'string') {
          try {
            const bodymapData = JSON.parse(block.value);
            if (bodymapData.image && bodymapData.points) {
              const rendered = await renderBodyMapToImage(bodymapData);
              imageAttachments.push({
                entryId: entry.id, entryTitle, entryDate: entryDateStr,
                blockLabel: block.label, imageData: rendered, type: 'bodymap',
              });
              const idx = imageAttachments.length;
              const comments = (bodymapData.points as PainPoint[]).filter(p => p.comment?.trim());
              let ref = `→ Bild ${idx} (${bodymapData.points.length} Pkt.)`;
              if (comments.length > 0) {
                ref += '\n' + comments.map(p => `${p.intensity}: ${p.comment}`).join('; ');
              }
              cellTexts.push(ref);
            } else {
              cellTexts.push('—');
            }
          } catch { cellTexts.push('—'); }
          continue;
        }

        // Legacy image-Block
        if (block.type === 'image' && block.value && typeof block.value === 'string') {
          try {
            const files = JSON.parse(block.value);
            if (Array.isArray(files) && files.length > 0) {
              const startIdx = imageAttachments.length + 1;
              files.forEach((file: { data: string; name?: string; type?: string }) => {
                if (file.data) {
                  imageAttachments.push({
                    entryId: entry.id!, entryTitle, entryDate: entryDateStr,
                    blockLabel: `${block.label} – ${file.name ?? (file.type === 'pdf' ? 'PDF' : 'Foto')}`,
                    imageData: file.data,
                    type: file.type === 'pdf' ? 'bodymap' : 'image',
                  });
                }
              });
              const endIdx = imageAttachments.length;
              cellTexts.push(`→ Bild ${startIdx}${endIdx > startIdx ? `–${endIdx}` : ''}`);
            } else {
              cellTexts.push('—');
            }
          } catch {
            if (block.value.startsWith('data:image')) {
              imageAttachments.push({
                entryId: entry.id!, entryTitle, entryDate: entryDateStr,
                blockLabel: block.label, imageData: block.value, type: 'image',
              });
              cellTexts.push(`→ Bild ${imageAttachments.length}`);
            } else {
              cellTexts.push('—');
            }
          }
          continue;
        }

        // Textarea mit Dateianhängen
        if (block.type === 'textarea' && block.value && typeof block.value === 'object') {
          const tv = block.value as TextAreaBlockValue;
          let cellText = tv.text?.trim() || '';
          if (tv.attachedFiles && tv.attachedFiles.length > 0) {
            const startIdx = imageAttachments.length + 1;
            tv.attachedFiles.forEach(file => {
              if (file.data) {
                imageAttachments.push({
                  entryId: entry.id!, entryTitle, entryDate: entryDateStr,
                  blockLabel: `${block.label} – ${file.name ?? (file.type === 'pdf' ? 'PDF' : 'Foto')}`,
                  imageData: file.data,
                  type: file.type === 'pdf' ? 'bodymap' : 'image',
                });
              }
            });
            const endIdx = imageAttachments.length;
            const ref = `→ Bild ${startIdx}${endIdx > startIdx ? `–${endIdx}` : ''}`;
            cellText = cellText ? `${cellText}\n${ref}` : ref;
          }
          cellTexts.push(cellText || '—');
          continue;
        }

        cellTexts.push(formatCellValue(block));
      }

      rows.push({ entry, dateText, cellTexts });
    }

    groups.push({ template, columns, legacyStart, rows });
  }

  // ── RENDER ──────────────────────────────────────────────────────────────
  const FONT_SIZE    = 8;
  const LINE_HEIGHT  = 3.8;  // mm pro Zeile bei 8pt
  const COL_HEADER_H = 7;
  const GROUP_H      = 9;
  const FOOTER_SPACE = 12;   // reserviert für Footer

  function needsNewPage(needed: number) {
    return yPosition + needed > pageHeight - FOOTER_SPACE;
  }

  // ── SEITEN-HEADER (Seite 1) ─────────────────────────────────────────────
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Schmerztagebuch', margin, yPosition);
  yPosition += 6;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const createdStr = `Erstellt: ${new Date().toLocaleDateString('de-DE', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })}`;
  doc.text(createdStr, margin, yPosition);

  if (selectedTemplate || startDate || endDate) {
    const parts: string[] = [];
    if (selectedTemplate) parts.push(`Template: ${selectedTemplate}`);
    if (startDate) parts.push(`Von: ${new Date(startDate).toLocaleDateString('de-DE')}`);
    if (endDate) parts.push(`Bis: ${new Date(endDate).toLocaleDateString('de-DE')}`);
    doc.text(parts.join(' | '), pageWidth - margin, yPosition, { align: 'right' });
  }
  yPosition += 4;

  const dateRange = entries.length > 0
    ? `${new Date(entries[entries.length - 1].timestamp).toLocaleDateString('de-DE')} – ${new Date(entries[0].timestamp).toLocaleDateString('de-DE')}`
    : '';
  doc.text(
    `${entries.length} Einträge${dateRange ? ` | Zeitraum: ${dateRange}` : ''}`,
    margin, yPosition,
  );
  yPosition += 3.5;

  doc.setDrawColor(180, 180, 190);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 5;

  // ── GRUPPEN / TABELLEN ──────────────────────────────────────────────────
  for (const group of groups) {
    const numCols = group.columns.length;
    const colW    = numCols > 0 ? (contentWidth - dateColW) / numCols : contentWidth - dateColW;

    // Gruppen-Header
    if (needsNewPage(GROUP_H + COL_HEADER_H + 8)) {
      doc.addPage();
      yPosition = margin;
    }

    doc.setFillColor(228, 230, 242);
    doc.rect(margin, yPosition, contentWidth, GROUP_H, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 90);
    doc.text(group.template?.name ?? 'Unbekanntes Template', margin + 3, yPosition + 6);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 110);
    doc.text(`${group.rows.length} Einträge`, pageWidth - margin - 3, yPosition + 6, { align: 'right' });
    yPosition += GROUP_H;

    // Spalten-Header (wird auch nach Seitenumbruch wiederholt)
    const renderColHeaders = () => {
      doc.setFillColor(55, 65, 90);
      doc.rect(margin, yPosition, contentWidth, COL_HEADER_H, 'F');

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Datum', margin + 2, yPosition + 5);

      let x = margin + dateColW;
      for (let ci = 0; ci < group.columns.length; ci++) {
        const col      = group.columns[ci];
        const isLegacy = ci >= group.legacyStart;

        // Legacy-Spalten: abgedunkelter Header
        if (isLegacy) {
          doc.setFillColor(90, 95, 115);
          doc.rect(x, yPosition, colW, COL_HEADER_H, 'F');
          doc.setFont('helvetica', 'bolditalic');
        } else {
          doc.setFont('helvetica', 'bold');
        }

        doc.setDrawColor(100, 115, 145);
        doc.line(x, yPosition, x, yPosition + COL_HEADER_H);
        const labelLine = doc.splitTextToSize(col.label, colW - 4)[0];
        doc.setTextColor(255, 255, 255);
        doc.text(labelLine, x + 2, yPosition + 5);
        x += colW;
      }
      yPosition += COL_HEADER_H;
      doc.setTextColor(0, 0, 0);
    };

    renderColHeaders();

    // Datenzeilen
    for (let rowIdx = 0; rowIdx < group.rows.length; rowIdx++) {
      const row = group.rows[rowIdx];

      // Zeilenhöhe berechnen
      doc.setFontSize(FONT_SIZE);
      let maxLines = doc.splitTextToSize(row.dateText, dateColW - 3).length;
      for (let ci = 0; ci < numCols; ci++) {
        const lines = doc.splitTextToSize(row.cellTexts[ci] ?? '—', colW - 3);
        maxLines = Math.max(maxLines, lines.length);
      }
      const rowH = Math.max(8, maxLines * LINE_HEIGHT + 3);

      // Seitenumbruch
      if (needsNewPage(rowH)) {
        doc.addPage();
        yPosition = margin;
        renderColHeaders();
      }

      // Abwechselnder Hintergrund
      if (rowIdx % 2 === 1) {
        doc.setFillColor(246, 247, 251);
        doc.rect(margin, yPosition, contentWidth, rowH, 'F');
      }

      // Datumszelle
      doc.setFontSize(FONT_SIZE);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(65, 65, 80);
      doc.text(doc.splitTextToSize(row.dateText, dateColW - 3), margin + 2, yPosition + 3.5);

      // Trennlinie nach Datum
      doc.setDrawColor(200, 205, 220);
      doc.line(margin + dateColW, yPosition, margin + dateColW, yPosition + rowH);

      // Block-Zellen
      doc.setTextColor(15, 15, 20);
      let x = margin + dateColW;
      for (let ci = 0; ci < numCols; ci++) {
        const cellText = row.cellTexts[ci] ?? '—';
        doc.text(doc.splitTextToSize(cellText, colW - 3), x + 2, yPosition + 3.5);
        // Vertikale Trennlinie
        doc.setDrawColor(200, 205, 220);
        doc.line(x + colW, yPosition, x + colW, yPosition + rowH);
        x += colW;
      }

      // Untere Zeilen-Linie
      doc.setDrawColor(195, 200, 215);
      doc.line(margin, yPosition + rowH, margin + contentWidth, yPosition + rowH);

      yPosition += rowH;
    }

    yPosition += 5; // Abstand nach Tabelle
  }

  // ── BILD-ANHANG ─────────────────────────────────────────────────────────
  if (imageAttachments.length > 0 && imageSize !== 'none') {
    doc.addPage();
    yPosition = margin;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Anhang: Bilder', margin, yPosition);
    yPosition += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`${imageAttachments.length} Bild${imageAttachments.length === 1 ? '' : 'er'}`, margin, yPosition);
    yPosition += 6;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;

    for (let i = 0; i < imageAttachments.length; i++) {
      const attachment = imageAttachments[i];
      if (i > 0) { doc.addPage(); yPosition = margin; }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`Bild ${i + 1}: ${attachment.blockLabel}`, margin, yPosition);
      yPosition += 5;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`Eintrag: ${attachment.entryTitle}`, margin, yPosition);
      yPosition += 4;
      doc.text(`Datum: ${attachment.entryDate}`, margin, yPosition);
      yPosition += 8;

      try {
        const sizeMM = IMAGE_SIZE_MM[imageSize as Exclude<ImageSize, 'none'>];
        const maxWidth  = Math.min(sizeMM.w - 10, pageWidth  - 2 * margin);
        const maxHeight = Math.min(sizeMM.h - 10, pageHeight - yPosition - 20);

        let imageData = attachment.imageData;
        if (!imageData.startsWith('data:')) {
          imageData = `data:image/png;base64,${imageData}`;
        }

        const img = new Image();
        img.src = imageData;
        await new Promise<void>((resolve) => {
          img.onload  = () => resolve();
          img.onerror = () => resolve();
          setTimeout(() => resolve(), 1000);
        });

        let imgWidth = maxWidth, imgHeight = maxHeight;
        if (img.width && img.height) {
          const ar = img.width / img.height;
          if (ar > maxWidth / maxHeight) { imgWidth = maxWidth; imgHeight = maxWidth / ar; }
          else                           { imgHeight = maxHeight; imgWidth = maxHeight * ar; }
        }

        const xOffset = margin + (maxWidth - imgWidth) / 2;
        doc.addImage(imageData, 'PNG', xOffset, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 5;

        if (attachment.type === 'bodymap') {
          doc.setFontSize(7);
          doc.setTextColor(100, 100, 100);
          doc.text('Körperkarte mit markierten Schmerzpunkten', margin, yPosition);
        }
      } catch (error) {
        console.error('Fehler beim Hinzufügen von Bild:', error);
        doc.setFontSize(8);
        doc.setTextColor(200, 0, 0);
        doc.text('Fehler: Bild konnte nicht geladen werden', margin, yPosition);
        yPosition += 8;
      }
    }
  }

  // ── FOOTER auf allen Seiten ──────────────────────────────────────────────
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('Schmerztagebuch PWA', margin, pageHeight - 6);
    doc.text(`Seite ${i} von ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
  }

  // ── SPEICHERN ────────────────────────────────────────────────────────────
  const fileName = `schmerztagebuch_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// ─── Hilfs-Typen für Karten/Dashboard ────────────────────────────────────────

interface CardAttachment {
  blockLabel: string;
  imageData: string;
  type: 'bodymap' | 'image';
}

// ─── Geteilte PDF-Hilfsfunktionen ─────────────────────────────────────────────

function addPdfHeader(
  doc: jsPDF,
  margin: number,
  pageWidth: number,
  entries: Entry[],
  startDate?: string,
  endDate?: string,
  selectedTemplate?: string,
): number {
  let y = margin;
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Schmerztagebuch', margin, y);
  y += 6;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const createdStr = `Erstellt: ${new Date().toLocaleDateString('de-DE', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })}`;
  doc.text(createdStr, margin, y);

  const parts: string[] = [];
  if (selectedTemplate) parts.push(`Template: ${selectedTemplate}`);
  if (startDate) parts.push(`Von: ${new Date(startDate).toLocaleDateString('de-DE')}`);
  if (endDate)   parts.push(`Bis: ${new Date(endDate).toLocaleDateString('de-DE')}`);
  if (parts.length) doc.text(parts.join(' | '), pageWidth - margin, y, { align: 'right' });
  y += 4;

  doc.text(`${entries.length} Einträge`, margin, y);
  y += 3.5;

  doc.setDrawColor(180, 180, 190);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  return y;
}

function addPdfFooter(doc: jsPDF, margin: number, pageWidth: number, pageHeight: number) {
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('Schmerztagebuch PWA', margin, pageHeight - 6);
    doc.text(`Seite ${i} von ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
  }
}

// ─── Karten-Layout ────────────────────────────────────────────────────────────

async function renderCardsLayout(options: PDFExportOptions): Promise<void> {
  const {
    entries, templates, decryptedData,
    startDate, endDate, selectedTemplate,
    imageSize = 'a5', password = '',
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfOptions: any = { orientation: 'portrait', unit: 'mm', format: 'a4' };
  if (password) {
    pdfOptions.encryption = {
      userPassword: password,
      ownerPassword: password + '_owner',
      userPermissions: ['print', 'copy'],
    };
  }
  const doc      = new jsPDF(pdfOptions);
  const pageW    = doc.internal.pageSize.getWidth();   // 210 mm
  const pageH    = doc.internal.pageSize.getHeight();  // 297 mm
  const mg       = 15;
  const cW       = pageW - 2 * mg;
  const FOOTER   = 12;
  const LABEL_W  = 55; // Label-Spalte
  const VAL_W    = cW - LABEL_W;

  let y = addPdfHeader(doc, mg, pageW, entries, startDate, endDate, selectedTemplate);

  function guard(needed: number) {
    if (y + needed > pageH - FOOTER) { doc.addPage(); y = mg; }
  }

  for (const entry of entries) {
    if (!entry.id) continue;
    const blocks   = decryptedData.get(entry.id) ?? [];
    const template = templates.find(t => t.id === entry.templateId);

    // Karten-Trennlinie + Datum
    guard(20);
    doc.setDrawColor(55, 65, 90);
    doc.setLineWidth(0.5);
    doc.line(mg, y, pageW - mg, y);
    y += 4;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 90);
    doc.text(
      new Date(entry.timestamp).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
      mg, y,
    );
    if (template?.name) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 150);
      doc.text(template.name, pageW - mg, y, { align: 'right' });
    }
    y += 6;
    doc.setLineWidth(0.2);
    doc.setTextColor(15, 15, 20);

    const cardAttachments: CardAttachment[] = [];

    for (const block of blocks) {
      // text- und date-Blöcke: date erscheint bereits im Karten-Header als Datum, sonst Duplikat.
      if (block.type === 'text' || block.type === 'date') continue;

      // Bodymap: inline rendern
      if (block.type === 'bodymap' && block.value && typeof block.value === 'string') {
        guard(10);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 100);
        doc.text(block.label + ':', mg, y);
        y += 4;
        try {
          const bData = JSON.parse(block.value);
          if (bData.image && bData.points) {
            const rendered = await renderBodyMapToImage(bData);
            const imgH = 60;
            const imgW = imgH * 0.75;
            guard(imgH + 5);
            doc.addImage(rendered, 'PNG', mg, y, imgW, imgH);
            y += imgH + 3;
          }
        } catch { /* skip */ }
        continue;
      }

      // Textarea: Text inline, Anhänge sammeln
      if (block.type === 'textarea' && block.value && typeof block.value === 'object') {
        const tv = block.value as TextAreaBlockValue;
        const text = tv.text?.trim() ?? '';
        const lines = text ? doc.splitTextToSize(text, VAL_W - 3) : ['—'];
        guard(Math.max(8, lines.length * 3.8 + 4));

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 100);
        doc.text(block.label + ':', mg, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 15, 20);
        doc.text(lines, mg + LABEL_W, y);
        y += Math.max(8, lines.length * 3.8 + 2);

        if (imageSize !== 'none' && tv.attachedFiles) {
          tv.attachedFiles.forEach(f => {
            if (f.data) cardAttachments.push({ blockLabel: block.label, imageData: f.data, type: f.type === 'pdf' ? 'bodymap' : 'image' });
          });
        }
        continue;
      }

      // Alle anderen Blöcke: Label + formatierter Wert
      const valStr  = formatCellValue(block);
      const valLines = doc.splitTextToSize(valStr, VAL_W - 3);
      guard(Math.max(7, valLines.length * 3.8 + 3));

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 100);
      doc.text(block.label + ':', mg, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 15, 20);
      doc.text(valLines, mg + LABEL_W, y);
      y += Math.max(7, valLines.length * 3.8 + 2);
    }

    // Anhänge dieser Karte inline
    for (const att of cardAttachments) {
      const sizeMM = IMAGE_SIZE_MM[imageSize as Exclude<ImageSize, 'none'>] ?? IMAGE_SIZE_MM['a5'];
      const maxW   = Math.min(sizeMM.w - 10, cW);
      const maxH   = Math.min(sizeMM.h - 10, 180);
      guard(30);
      try {
        let imgData = att.imageData;
        if (!imgData.startsWith('data:')) imgData = `data:image/png;base64,${imgData}`;
        const img = new Image();
        img.src = imgData;
        await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); setTimeout(r, 800); });
        let iW = maxW, iH = maxH;
        if (img.width && img.height) {
          const ar = img.width / img.height;
          if (ar > maxW / maxH) { iW = maxW; iH = maxW / ar; }
          else                   { iH = maxH; iW = maxH * ar; }
        }
        guard(iH + 8);
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 120);
        doc.text(att.blockLabel, mg, y); y += 3;
        doc.addImage(imgData, 'PNG', mg, y, iW, iH);
        y += iH + 4;
      } catch { /* skip */ }
    }

    y += 4;
  }

  addPdfFooter(doc, mg, pageW, pageH);
  doc.save(`schmerztagebuch_${new Date().toISOString().split('T')[0]}_karten.pdf`);
}

// ─── Dashboard+Detail-Layout ──────────────────────────────────────────────────

async function renderDashboardLayout(options: PDFExportOptions): Promise<void> {
  const {
    entries, templates, decryptedData,
    startDate, endDate, selectedTemplate,
    imageSize = 'a5', password = '',
    selectedMultiselects = [],
    chartImageUri,
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfOptions: any = { orientation: 'portrait', unit: 'mm', format: 'a4' };
  if (password) {
    pdfOptions.encryption = {
      userPassword: password,
      ownerPassword: password + '_owner',
      userPermissions: ['print', 'copy'],
    };
  }
  const doc    = new jsPDF(pdfOptions);
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const mg     = 15;
  const cW     = pageW - 2 * mg;
  const FOOTER = 12;
  let y = mg;

  function guard(needed: number) {
    if (y + needed > pageH - FOOTER) { doc.addPage(); y = mg; }
  }

  // ── SEITE 1: ZUSAMMENFASSUNG ─────────────────────────────────────────────

  // Titel
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 90);
  doc.text('Schmerztagebuch — Verlaufsbericht', mg, y);
  y += 7;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 130);
  const infoParts: string[] = [];
  if (selectedTemplate) infoParts.push(selectedTemplate);
  if (startDate) infoParts.push(`Von: ${new Date(startDate).toLocaleDateString('de-DE')}`);
  if (endDate)   infoParts.push(`Bis: ${new Date(endDate).toLocaleDateString('de-DE')}`);
  infoParts.push(`${entries.length} Einträge`);
  doc.text(infoParts.join(' · '), mg, y);
  y += 3;

  doc.setDrawColor(55, 65, 90);
  doc.setLineWidth(0.6);
  doc.line(mg, y, pageW - mg, y);
  y += 6;

  // ── CHART ────────────────────────────────────────────────────────────────
  if (chartImageUri) {
    try {
      const chartH = 65;
      doc.addImage(chartImageUri, 'PNG', mg, y, cW, chartH);
      y += chartH + 5;
    } catch { /* chart nicht verfügbar */ }
  } else {
    // Platzhalter wenn kein Chart
    doc.setFillColor(240, 242, 248);
    doc.rect(mg, y, cW, 55, 'F');
    doc.setFontSize(8);
    doc.setTextColor(140, 145, 170);
    doc.text('Schmerzdiagramm', mg + cW / 2, y + 28, { align: 'center' });
    y += 60;
  }

  // ── STATISTIK ────────────────────────────────────────────────────────────
  const painValues: number[] = [];
  for (const entry of entries) {
    if (!entry.id) continue;
    const blocks = decryptedData.get(entry.id) ?? [];
    for (const b of blocks) {
      if (b.type === 'slider' && b.dashboard?.type === 'pain' && typeof b.value === 'number') {
        painValues.push(b.value);
      }
    }
  }
  if (painValues.length > 0) {
    const avg = (painValues.reduce((a, b) => a + b, 0) / painValues.length).toFixed(1);
    const min = Math.min(...painValues);
    const max = Math.max(...painValues);

    doc.setFillColor(245, 246, 252);
    doc.rect(mg, y, cW, 12, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 90);
    doc.text(`Ø ${avg}`, mg + 4, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 110);
    doc.text(`Min: ${min}   Max: ${max}   ${painValues.length} Messung${painValues.length !== 1 ? 'en' : ''}`, mg + 22, y + 8);
    y += 16;
  }

  // ── EVENTS + ARZTBESUCHE ─────────────────────────────────────────────────
  type EventItem = { date: string; title: string; category: 'event' | 'doctor' };
  const events: EventItem[] = [];
  for (const entry of entries) {
    if (!entry.id) continue;
    const blocks = decryptedData.get(entry.id) ?? [];
    for (const b of blocks) {
      if (b.type === 'textarea' && b.value && typeof b.value === 'object') {
        const tv = b.value as TextAreaBlockValue;
        const dateStr = new Date(entry.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
        (tv.events ?? []).forEach(ev => {
          events.push({ date: dateStr, title: ev.eventTitle, category: ev.eventCategory });
        });
      }
    }
  }

  const doctors = events.filter(e => e.category === 'doctor');
  const general = events.filter(e => e.category === 'event');

  const renderEventList = (label: string, items: EventItem[]) => {
    if (items.length === 0) return;
    guard(8 + items.length * 5);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 90);
    doc.text(label, mg, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 50);
    items.forEach(ev => {
      doc.text(`• ${ev.date}  –  ${ev.title}`, mg + 2, y); y += 5;
    });
    y += 3;
  };

  renderEventList('Arztbesuche', doctors);
  renderEventList('Ereignisse', general);

  // ── MULTISELECT-HÄUFIGKEITEN ─────────────────────────────────────────────
  if (selectedMultiselects.length > 0) {
    const allTemplateBlocks = templates.flatMap(t => t.blocks);
    const selectedBlocks = allTemplateBlocks.filter(b =>
      b.type === 'multiselect' && selectedMultiselects.includes(b.id)
    );

    for (const msBlock of selectedBlocks) {
      // Frequenz berechnen
      const freq = new Map<string, number>();
      for (const entry of entries) {
        if (!entry.id) continue;
        const blocks = decryptedData.get(entry.id) ?? [];
        const found = blocks.find(b => b.id === msBlock.id || b.label === msBlock.label);
        if (found && Array.isArray(found.value)) {
          (found.value as string[]).forEach(v => freq.set(v, (freq.get(v) ?? 0) + 1));
        }
      }
      if (freq.size === 0) continue;

      const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const maxCount = sorted[0][1];

      guard(10 + sorted.length * 7);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 90);
      doc.text(msBlock.label, mg, y); y += 5;

      const barMaxW = cW - 40;
      for (const [label, count] of sorted) {
        const barW = (count / maxCount) * barMaxW;
        doc.setFillColor(55, 65, 140);
        doc.rect(mg + 2, y - 3.5, barW, 4, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 50);
        doc.text(`${label} (${count}×)`, mg + barW + 5, y);
        y += 6;
      }
      y += 3;
    }
  }

  // ── BODYMAP HEATMAP PLATZHALTER ──────────────────────────────────────────
  guard(35);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 90);
  doc.text('Schmerzlokalisation', mg, y); y += 5;
  doc.setFillColor(240, 242, 248);
  doc.rect(mg, y, cW, 28, 'F');
  doc.setDrawColor(180, 185, 210);
  doc.setLineWidth(0.3);
  doc.rect(mg, y, cW, 28);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(140, 145, 170);
  doc.text('Bodymap-Heatmap (in Vorbereitung)', mg + cW / 2, y + 16, { align: 'center' });
  y += 34;

  // ── SEITEN 2+: VOLLSTÄNDIGE EINTRÄGE (Karten) ────────────────────────────
  doc.addPage();
  y = mg;

  // Sub-Header
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 90);
  doc.text('Vollständige Einträge', mg, y); y += 5;
  doc.setDrawColor(180, 180, 190);
  doc.setLineWidth(0.3);
  doc.line(mg, y, pageW - mg, y); y += 5;

  // Karten-Rendering (gleich wie renderCardsLayout)
  const LABEL_W = 55;
  const VAL_W   = cW - LABEL_W;

  for (const entry of entries) {
    if (!entry.id) continue;
    const blocks   = decryptedData.get(entry.id) ?? [];
    const template = templates.find(t => t.id === entry.templateId);

    guard(20);
    doc.setDrawColor(55, 65, 90);
    doc.setLineWidth(0.5);
    doc.line(mg, y, pageW - mg, y); y += 4;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 90);
    doc.text(
      new Date(entry.timestamp).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
      mg, y,
    );
    if (template?.name) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 150);
      doc.text(template.name, pageW - mg, y, { align: 'right' });
    }
    y += 6;
    doc.setLineWidth(0.2);
    doc.setTextColor(15, 15, 20);

    const cardAttachments: CardAttachment[] = [];

    for (const block of blocks) {
      // text- und date-Blöcke: date erscheint bereits im Karten-Header als Datum, sonst Duplikat.
      if (block.type === 'text' || block.type === 'date') continue;

      if (block.type === 'bodymap' && block.value && typeof block.value === 'string') {
        guard(10);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 100);
        doc.text(block.label + ':', mg, y); y += 4;
        try {
          const bData = JSON.parse(block.value);
          if (bData.image && bData.points) {
            const rendered = await renderBodyMapToImage(bData);
            const imgH = 60; const imgW = imgH * 0.75;
            guard(imgH + 5);
            doc.addImage(rendered, 'PNG', mg, y, imgW, imgH);
            y += imgH + 3;
          }
        } catch { /* skip */ }
        continue;
      }

      if (block.type === 'textarea' && block.value && typeof block.value === 'object') {
        const tv = block.value as TextAreaBlockValue;
        const text = tv.text?.trim() ?? '';
        const lines = text ? doc.splitTextToSize(text, VAL_W - 3) : ['—'];
        guard(Math.max(8, lines.length * 3.8 + 4));
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 100);
        doc.text(block.label + ':', mg, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 15, 20);
        doc.text(lines, mg + LABEL_W, y);
        y += Math.max(8, lines.length * 3.8 + 2);
        if (imageSize !== 'none' && tv.attachedFiles) {
          tv.attachedFiles.forEach(f => {
            if (f.data) cardAttachments.push({ blockLabel: block.label, imageData: f.data, type: f.type === 'pdf' ? 'bodymap' : 'image' });
          });
        }
        continue;
      }

      const valStr   = formatCellValue(block);
      const valLines = doc.splitTextToSize(valStr, VAL_W - 3);
      guard(Math.max(7, valLines.length * 3.8 + 3));
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 100);
      doc.text(block.label + ':', mg, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 15, 20);
      doc.text(valLines, mg + LABEL_W, y);
      y += Math.max(7, valLines.length * 3.8 + 2);
    }

    for (const att of cardAttachments) {
      const sizeMM = IMAGE_SIZE_MM[imageSize as Exclude<ImageSize, 'none'>] ?? IMAGE_SIZE_MM['a5'];
      const maxW = Math.min(sizeMM.w - 10, cW);
      const maxH = Math.min(sizeMM.h - 10, 180);
      guard(30);
      try {
        let imgData = att.imageData;
        if (!imgData.startsWith('data:')) imgData = `data:image/png;base64,${imgData}`;
        const img = new Image();
        img.src = imgData;
        await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); setTimeout(r, 800); });
        let iW = maxW, iH = maxH;
        if (img.width && img.height) {
          const ar = img.width / img.height;
          if (ar > maxW / maxH) { iW = maxW; iH = maxW / ar; }
          else                   { iH = maxH; iW = maxH * ar; }
        }
        guard(iH + 8);
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 120);
        doc.text(att.blockLabel, mg, y); y += 3;
        doc.addImage(imgData, 'PNG', mg, y, iW, iH);
        y += iH + 4;
      } catch { /* skip */ }
    }

    y += 4;
  }

  addPdfFooter(doc, mg, pageW, pageH);
  doc.save(`schmerztagebuch_${new Date().toISOString().split('T')[0]}_bericht.pdf`);
}
