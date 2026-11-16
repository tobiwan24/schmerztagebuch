// PNG-Export einer Auswertungs-Ansicht (Spec 06, ANA-14). Ohne zusätzliche Bibliothek:
// - Recharts-Diagramm: SVG klonen, berechnete Farben/Schriften einbetten (CSS-Variablen gelten im Einzel-SVG nicht),
//   als Bild ins Canvas zeichnen.
// - Kalender und Körperkarte: direkt ins Canvas zeichnen (kein `foreignObject` — würde das Canvas in Safari sperren).
// Oben steht eine Titelzeile (Ansicht + Zeitraum); Hintergrund = Theme-Hintergrund.
const SCALE = 2;
const PAD = 16;
const TITLE_H = 40;

const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline'];

function inlineStyles(source: Element, target: Element) {
  const cs = getComputedStyle(source);
  const style = STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
  target.setAttribute('style', style);
  const s = source.children;
  const t = target.children;
  for (let i = 0; i < s.length; i++) inlineStyles(s[i]!, t[i]!);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild für den Export konnte nicht geladen werden'));
    img.src = src;
  });
}

function canvasFor(width: number, height: number, title: string, root: Element) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((width + PAD * 2) * SCALE);
  canvas.height = Math.round((height + PAD * 2 + TITLE_H) * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  ctx.scale(SCALE, SCALE);
  const cs = getComputedStyle(root);
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, width + PAD * 2, height + PAD * 2 + TITLE_H);
  ctx.fillStyle = cs.color || '#000000';
  ctx.font = `600 15px ${cs.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(title, PAD, PAD + TITLE_H / 2 - 4);
  ctx.translate(PAD, PAD + TITLE_H);
  return { canvas, ctx };
}

async function drawChart(svg: SVGSVGElement, title: string, root: Element): Promise<HTMLCanvasElement> {
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
  const { canvas, ctx } = canvasFor(width, height, title, root);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function drawCalendar(grid: HTMLElement, title: string, root: Element): HTMLCanvasElement {
  const box = grid.getBoundingClientRect();
  const { canvas, ctx } = canvasFor(box.width, box.height, title, root);
  for (const cell of Array.from(grid.children) as HTMLElement[]) {
    const r = cell.getBoundingClientRect();
    const cs = getComputedStyle(cell);
    const x = r.left - box.left;
    const y = r.top - box.top;
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      ctx.fillStyle = cs.backgroundColor;
      ctx.fillRect(x, y, r.width, r.height);
    }
    if (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') {
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, r.width - 1, r.height - 1);
    }
    if (cell.textContent) {
      ctx.fillStyle = cs.color;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cell.textContent, x + r.width / 2, y + r.height / 2);
    }
  }
  return canvas;
}

async function drawBodymap(container: HTMLElement, title: string, root: Element): Promise<HTMLCanvasElement> {
  const imgEl = container.querySelector('img');
  const box = container.getBoundingClientRect();
  const { canvas, ctx } = canvasFor(box.width, box.height, title, root);
  if (imgEl) {
    const r = imgEl.getBoundingClientRect();
    // object-contain nachbilden
    const ratio = Math.min(r.width / imgEl.naturalWidth, r.height / imgEl.naturalHeight);
    const w = imgEl.naturalWidth * ratio;
    const h = imgEl.naturalHeight * ratio;
    ctx.drawImage(await loadImage(imgEl.src), r.left - box.left + (r.width - w) / 2, r.top - box.top + (r.height - h) / 2, w, h);
  }
  for (const c of Array.from(container.querySelectorAll('circle'))) {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    ctx.globalAlpha = Number(c.getAttribute('opacity') ?? cs.opacity ?? 1);
    ctx.fillStyle = cs.fill;
    ctx.beginPath();
    ctx.ellipse(r.left - box.left + r.width / 2, r.top - box.top + r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/** Rendert die Ansicht in `root` als PNG. */
export async function renderViewAsPng(root: HTMLElement, title: string): Promise<Blob> {
  const svg = root.querySelector<SVGSVGElement>('svg.recharts-surface');
  const grid = root.querySelector<HTMLElement>('[data-testid="calendar-grid"]');
  const body = root.querySelector<HTMLElement>('[data-testid="bodymap-overview"]');
  const canvas = svg ? await drawChart(svg, title, root) : grid ? drawCalendar(grid, title, root) : body ? await drawBodymap(body, title, root) : null;
  if (!canvas) throw new Error('Nichts zu exportieren');
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG konnte nicht erzeugt werden'))), 'image/png'));
}

/** Rendert die Ansicht in `root` als PNG und löst den Download aus. */
export async function exportViewAsPng(root: HTMLElement, title: string, fileName: string): Promise<void> {
  const blob = await renderViewAsPng(root, title);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
