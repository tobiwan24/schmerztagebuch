import jsPDF from 'jspdf';
import type { Entry, Template } from '../types/database';
import type { Block } from '../types/blocks';

interface PainPoint {
  x: number;
  y: number;
  intensity: number;
  diameter: number;
  comment: string;
  type: 'point' | 'brush';
  path?: { x: number; y: number }[];
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
      // Canvas erstellen
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context nicht verfügbar'));
        return;
      }
      
      // Basis-Bild zeichnen
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Hilfsfunktion: Farbe basierend auf Intensität
      function getColorForIntensity(intensity: number): string {
        if (intensity <= 3) return '#22c55e'; // Grün
        if (intensity <= 6) return '#eab308'; // Gelb
        if (intensity <= 8) return '#f97316'; // Orange
        return '#ef4444'; // Rot
      }
      
      // Schmerzpunkte zeichnen
      data.points.forEach(point => {
        const color = getColorForIntensity(point.intensity);
        const radius = point.diameter / 2;
        
        if (point.type === 'brush' && point.path && point.path.length > 0) {
          // Pinselstrich zeichnen
          point.path.forEach(pos => {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = color + '60'; // 40% opacity
            ctx.fill();
          });
        } else {
          // Punkt zeichnen
          // Äußerer Kreis (Glow-Effekt)
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius + 5, 0, 2 * Math.PI);
          ctx.fillStyle = color + '40';
          ctx.fill();
          
          // Innerer Kreis
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = color + 'CC';
          ctx.fill();
          
          // Rand
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // Intensität als Zahl
          ctx.fillStyle = 'white';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(point.intensity.toString(), point.x, point.y);
        }
      });
      
      // Canvas zu Data-URL konvertieren
      const dataUrl = canvas.toDataURL('image/png');
      resolve(dataUrl);
    };
    
    img.onerror = () => {
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    
    img.src = data.image;
  });
}

interface PDFExportOptions {
  entries: Entry[];
  templates: Template[];
  decryptedData: Map<number, Block[]>; // entryId -> decrypted blocks
  startDate?: string;
  endDate?: string;
  selectedTemplate?: string;
}

interface ImageAttachment {
  entryId: number;
  entryTitle: string;
  entryDate: string;
  blockLabel: string;
  imageData: string; // Base64 oder Data URL
  type: 'bodymap' | 'image';
}

/**
 * Exportiert gefilterte Einträge als medizinisches PDF
 */
export async function exportToPDF(options: PDFExportOptions): Promise<void> {
  const { entries, templates, decryptedData, startDate, endDate, selectedTemplate } = options;
  
  // PDF erstellen (A4 Format)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPosition = margin;
  
  // Sammle Bilder für Anhang
  const imageAttachments: ImageAttachment[] = [];
  
  // Helper: Neue Seite wenn nötig
  function checkPageBreak(neededSpace: number = 15) {
    if (yPosition + neededSpace > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
  }
  
  // Helper: Text mit Wrapping
  function addWrappedText(text: string, x: number, maxWidth: number, fontSize: number = 10) {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, yPosition);
    yPosition += lines.length * (fontSize * 0.4);
  }
  
  // ========== HEADER ==========
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Schmerztagebuch', margin, yPosition);
  yPosition += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Erstellt am: ${new Date().toLocaleDateString('de-DE', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}`, margin, yPosition);
  yPosition += 7;
  
  // Filter-Info
  if (selectedTemplate || startDate || endDate) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    let filterText = 'Filter: ';
    if (selectedTemplate) filterText += `Template: ${selectedTemplate}`;
    if (startDate) filterText += ` | Von: ${new Date(startDate).toLocaleDateString('de-DE')}`;
    if (endDate) filterText += ` | Bis: ${new Date(endDate).toLocaleDateString('de-DE')}`;
    doc.text(filterText, margin, yPosition);
    yPosition += 7;
  }
  
  // Linie
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;
  
  // ========== STATISTIK ==========
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Übersicht', margin, yPosition);
  yPosition += 7;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Anzahl Einträge: ${entries.length}`, margin, yPosition);
  yPosition += 5;
  
  const dateRange = entries.length > 0 
    ? `${new Date(entries[entries.length - 1].timestamp).toLocaleDateString('de-DE')} - ${new Date(entries[0].timestamp).toLocaleDateString('de-DE')}`
    : 'Keine Einträge';
  doc.text(`Zeitraum: ${dateRange}`, margin, yPosition);
  yPosition += 10;
  
  // Linie
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;
  
  // ========== EINTRÄGE ==========
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Einträge', margin, yPosition);
  yPosition += 10;
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const template = templates.find(t => t.id === entry.templateId);
    const blocks = decryptedData.get(entry.id!);
    
    checkPageBreak(30);
    
    // Eintrag Header
    doc.setFillColor(240, 240, 255);
    doc.rect(margin, yPosition - 5, pageWidth - 2 * margin, 12, 'F');
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`${i + 1}. ${template?.name || 'Unbekanntes Template'}`, margin + 2, yPosition);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    const dateText = new Date(entry.timestamp).toLocaleDateString('de-DE', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    doc.text(dateText, pageWidth - margin - 2, yPosition, { align: 'right' });
    yPosition += 10;
    
    // Eintrag Daten
    if (blocks && blocks.length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      for (const block of blocks) {
        checkPageBreak(15);
        
        // Label
        doc.setFont('helvetica', 'bold');
        doc.text(`${block.label}:`, margin + 5, yPosition);
        yPosition += 5;
        
        doc.setFont('helvetica', 'normal');
        
        // Wert basierend auf Block-Typ
        let valueText = '';
        
        switch (block.type) {
          case 'text':
          case 'textarea':
            valueText = String(block.value || '—');
            break;
          case 'slider':
            valueText = String(block.value ?? '—');
            break;
          case 'date':
            valueText = block.value ? new Date(String(block.value)).toLocaleDateString('de-DE') : '—';
            break;
          case 'checkbox':
            valueText = block.value ? '☑ Ja' : '☐ Nein';
            break;
          case 'multiselect':
            if (Array.isArray(block.value) && block.value.length > 0) {
              valueText = block.value.join(', ');
            } else {
              valueText = '—';
            }
            break;
          case 'bodymap':
            if (block.value && typeof block.value === 'string') {
              try {
                const bodymapData = JSON.parse(block.value);
                if (bodymapData.image && bodymapData.points) {
                  // Erstelle Canvas-Bild MIT Schmerzpunkten
                  const renderedImage = await renderBodyMapToImage(bodymapData);
                  
                  // Bild für Anhang sammeln
                  imageAttachments.push({
                    entryId: entry.id!,
                    entryTitle: `${template?.name || 'Unbekannt'}`,
                    entryDate: dateText,
                    blockLabel: block.label,
                    imageData: renderedImage,
                    type: 'bodymap'
                  });
                  
                  // Text mit Kommentaren erstellen
                  let pointsText = `Schmerzpunkte erfasst (${bodymapData.points.length} Punkte) - siehe Anhang Seite ${imageAttachments.length}`;
                  
                  // Füge Kommentare hinzu
                  const pointsWithComments = bodymapData.points.filter((p: any) => p.comment && p.comment.trim());
                  if (pointsWithComments.length > 0) {
                    pointsText += '\n\nKommentare:';
                    pointsWithComments.forEach((p: any, idx: number) => {
                      pointsText += `\n${idx + 1}. Intensität ${p.intensity}/10: ${p.comment}`;
                    });
                  }
                  
                  valueText = pointsText;
                } else {
                  valueText = 'Keine Schmerzpunkte';
                }
              } catch {
                valueText = 'Fehler beim Laden der BodyMap';
              }
            } else {
              valueText = 'Keine Schmerzpunkte';
            }
            break;
          case 'image':
            if (block.value && typeof block.value === 'string') {
              try {
                // Neues Format: Array von Dateien
                const files = JSON.parse(block.value);
                if (Array.isArray(files) && files.length > 0) {
                  files.forEach((file: any) => {
                    if (file.data) {
                      imageAttachments.push({
                        entryId: entry.id!,
                        entryTitle: `${template?.name || 'Unbekannt'}`,
                        entryDate: dateText,
                        blockLabel: `${block.label} - ${file.name || (file.type === 'pdf' ? 'PDF' : 'Foto')}`,
                        imageData: file.data,
                        type: file.type === 'pdf' ? 'bodymap' : 'image' // PDF als bodymap type für korrektes Rendering
                      });
                    }
                  });
                  valueText = `${files.length} Datei${files.length === 1 ? '' : 'en'} - siehe Anhang ab Seite ${imageAttachments.length - files.length + 1}`;
                } else {
                  valueText = 'Keine Dateien';
                }
              } catch {
                // Altes Format: einzelnes Bild als String
                if (block.value.startsWith('data:image')) {
                  imageAttachments.push({
                    entryId: entry.id!,
                    entryTitle: `${template?.name || 'Unbekannt'}`,
                    entryDate: dateText,
                    blockLabel: block.label,
                    imageData: block.value,
                    type: 'image'
                  });
                  valueText = `Foto vorhanden - siehe Anhang Seite ${imageAttachments.length}`;
                } else {
                  valueText = 'Keine Dateien';
                }
              }
            } else {
              valueText = 'Keine Dateien';
            }
            break;
          default:
            valueText = String(block.value || '—');
        }
        
        addWrappedText(valueText, margin + 10, pageWidth - 2 * margin - 15, 10);
        yPosition += 3;
      }
    } else {
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text('Keine Daten verfügbar', margin + 5, yPosition);
      yPosition += 5;
    }
    
    yPosition += 5;
    
    // Trennlinie zwischen Einträgen
    if (i < entries.length - 1) {
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 5;
    }
  }
  
  // ========== FOOTER auf jeder Seite ==========
  const totalPages = doc.internal.pages.length - 1; // -1 wegen index 0
  
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Seite ${i} von ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
    doc.text(
      'Schmerztagebuch PWA',
      margin,
      pageHeight - 10
    );
  }
  
  // ========== BILDER-ANHANG ==========
  if (imageAttachments.length > 0) {
    // Neue Seite für Anhang
    doc.addPage();
    yPosition = margin;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Anhang: Bilder', margin, yPosition);
    yPosition += 10;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`${imageAttachments.length} Bild${imageAttachments.length === 1 ? '' : 'er'}`, margin, yPosition);
    yPosition += 10;
    
    // Linie
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;
    
    // Jedes Bild auf separater Seite
    for (let i = 0; i < imageAttachments.length; i++) {
      const attachment = imageAttachments[i];
      
      if (i > 0) {
        doc.addPage();
        yPosition = margin;
      }
      
      // Bild-Info
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`Bild ${i + 1}: ${attachment.blockLabel}`, margin, yPosition);
      yPosition += 6;
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`Eintrag: ${attachment.entryTitle}`, margin, yPosition);
      yPosition += 5;
      doc.text(`Datum: ${attachment.entryDate}`, margin, yPosition);
      yPosition += 10;
      
      // Bild einfügen
      try {
        // Maximalmaße für Bild (A4: 210mm x 297mm, mit margins)
        const maxWidth = pageWidth - 2 * margin;
        const maxHeight = pageHeight - yPosition - 20; // 20mm für Footer
        
        // Bild-Daten vorbereiten
        let imageData = attachment.imageData;
        
        // Stelle sicher dass es ein vollständiges Data-URL ist
        if (!imageData.startsWith('data:')) {
          imageData = `data:image/png;base64,${imageData}`;
        }
        
        // Versuche Bild-Dimensionen zu ermitteln
        const img = new Image();
        img.src = imageData;
        
        // Warte auf Bild-Load (synchron)
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Auch bei Fehler fortfahren
          // Timeout nach 1 Sekunde
          setTimeout(() => resolve(), 1000);
        });
        
        // Berechne Bildgröße (behalte Aspekt-Ratio)
        let imgWidth = maxWidth;
        let imgHeight = maxHeight;
        
        if (img.width && img.height) {
          const aspectRatio = img.width / img.height;
          
          if (aspectRatio > maxWidth / maxHeight) {
            // Bild ist breiter
            imgWidth = maxWidth;
            imgHeight = maxWidth / aspectRatio;
          } else {
            // Bild ist höher
            imgHeight = maxHeight;
            imgWidth = maxHeight * aspectRatio;
          }
        }
        
        // Zentriere Bild horizontal
        const xOffset = margin + (maxWidth - imgWidth) / 2;
        
        // Füge Bild ein
        doc.addImage(
          imageData,
          'PNG',
          xOffset,
          yPosition,
          imgWidth,
          imgHeight
        );
        
        yPosition += imgHeight + 5;
        
        // Hinweis falls BodyMap
        if (attachment.type === 'bodymap') {
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text('Körperkarte mit markierten Schmerzpunkten', margin, yPosition);
        }
        
      } catch (error) {
        console.error('Fehler beim Hinzufügen von Bild:', error);
        doc.setFontSize(9);
        doc.setTextColor(200, 0, 0);
        doc.text('Fehler: Bild konnte nicht geladen werden', margin, yPosition);
        yPosition += 10;
      }
    }
  }
  
  // ========== PDF SPEICHERN ==========
  const fileName = `schmerztagebuch_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
