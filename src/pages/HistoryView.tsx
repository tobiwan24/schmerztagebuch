import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getEntries, getTemplates, deleteEntry, updateEntry } from '../db';
import { useDecrypt } from '../hooks/useDecrypt';
import { useNavigation } from '../contexts/NavigationContext';
import { exportToPDF } from '../utils/pdfExport';
import type { ImageSize } from '../utils/pdfExport';
import { getIconComponent } from '../utils/iconUtils';
import { encryptWithKey } from '../utils/crypto';
import { getSessionKey } from '../utils/auth';
import type { Entry, Template } from '../types/database';
import type { Block, TextAreaBlockValue } from '../types/blocks';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Trash2, ChevronRight, X, Download,
  Filter, ArrowUpDown, Check, ChevronDown,
  Calendar, Stethoscope, Map as MapIcon, ImageIcon, FileText,
  CalendarDays, Tag, Pencil, Save
} from 'lucide-react';
import BlockRenderer from '../components/BlockRenderer';
import PageTutorial from '../components/tutorial/PageTutorial';

// ─── Typen ───────────────────────────────────────────────────────────────────

type SortOption =
  | 'newest'
  | 'oldest'
  | 'template_az'
  | 'template_date';

type ContentFilter =
  | 'events'
  | 'doctor'
  | 'bodymap'
  | 'photo'
  | 'pdf';

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function getPainColor(value: number): string {
  if (value <= 3) return '#22c55e';
  if (value <= 6) return '#eab308';
  if (value <= 8) return '#f97316';
  return '#ef4444';
}

/** Extrahiert Vorschautext + Metadaten aus entschlüsselten Blöcken */
function extractEntryMeta(blocks: Block[]) {
  let previewText = '';
  let painValue: number | null = null;
  let painCount = 0;
  let hasEvent = false;
  let hasDoctor = false;
  let hasBodyMap = false;
  let hasPhoto = false;
  let hasPdf = false;

  for (const block of blocks) {
    // Vorschautext: erster Text/Textarea-Block mit Inhalt
    if (!previewText && (block.type === 'text' || block.type === 'textarea')) {
      if (typeof block.value === 'string' && block.value.trim()) {
        previewText = block.value.trim();
      } else if (block.value && typeof block.value === 'object' && 'text' in block.value) {
        const tv = block.value as TextAreaBlockValue;
        if (tv.text?.trim()) previewText = tv.text.trim();
      }
    }

    // Events / Arzttermine aus Textarea
    if (block.type === 'textarea' && block.value && typeof block.value === 'object') {
      const tv = block.value as TextAreaBlockValue;
      if (tv.events) {
        for (const ev of tv.events) {
          if (ev.eventCategory === 'event') hasEvent = true;
          if (ev.eventCategory === 'doctor') hasDoctor = true;
        }
      }
      if (tv.attachedFiles) {
        for (const f of tv.attachedFiles) {
          if (f.type === 'pdf') hasPdf = true;
          else hasPhoto = true;
        }
      }
    }

    // Bildblock (legacy)
    if (block.type === 'image' && block.value) {
      try {
        const files = JSON.parse(block.value as string);
        if (Array.isArray(files)) {
          for (const f of files) {
            if (f.type === 'pdf') hasPdf = true;
            else hasPhoto = true;
          }
        }
      } catch {
        hasPhoto = true;
      }
    }

    // BodyMap
    if (block.type === 'bodymap' && block.value) {
      try {
        const bm = JSON.parse(block.value as string);
        if (bm.points?.length > 0) hasBodyMap = true;
      } catch { /* ignore */ }
    }

    // Schmerzwert (pain slider)
    if (block.type === 'slider' && block.dashboard?.type === 'pain' && typeof block.value === 'number') {
      painValue = (painValue ?? 0) + block.value;
      painCount++;
    }
  }

  const avgPain = painValue !== null && painCount > 0 ? painValue / painCount : null;

  return { previewText, avgPain, hasEvent, hasDoctor, hasBodyMap, hasPhoto, hasPdf };
}

// ─── EntryCard (meta via prop — eager decrypt in HistoryView) ────────────────

interface EntryCardProps {
  entry: Entry;
  template: Template | undefined;
  onClick: () => void;
  meta?: ReturnType<typeof extractEntryMeta>;
  decryptError?: string;
}

function EntryCard({ entry, template, onClick, meta, decryptError }: EntryCardProps) {
  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleDateString('de-DE', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const iconColor = template?.color ?? '#6366f1';

  return (
    <div
      className="history-entry-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Template-Icon */}
      <div
        className="history-entry-icon"
        style={{ background: iconColor }}
      >
        {React.createElement(getIconComponent(template?.icon), { size: 20, className: 'text-white', strokeWidth: 2 })}
      </div>

      {/* Content */}
      <div className="history-entry-content">
        {/* Zeile 1: Vorschautext / Fehler */}
        <p className="history-entry-preview">
          {decryptError
            ? <span className="text-destructive text-xs">{decryptError}</span>
            : meta?.previewText
              ? meta.previewText.slice(0, 80) + (meta.previewText.length > 80 ? '…' : '')
              : (template?.name ?? 'Eintrag')}
        </p>

        {/* Zeile 2: Datum + Inline-Icons */}
        <div className="history-entry-meta">
          <span className="history-entry-date">{dateStr}</span>

          {meta && (
            <span className="history-entry-icons">
              {meta.hasEvent && <span className="history-icon-chip history-icon-chip--event" aria-label="Event"><Calendar size={11} /></span>}
              {meta.hasDoctor && <span className="history-icon-chip history-icon-chip--doctor" aria-label="Arzttermin"><Stethoscope size={11} /></span>}
              {meta.hasBodyMap && <span className="history-icon-chip history-icon-chip--bodymap" aria-label="Körperkarte"><MapIcon size={11} /></span>}
              {meta.hasPhoto && <span className="history-icon-chip history-icon-chip--photo" aria-label="Foto"><ImageIcon size={11} /></span>}
              {meta.hasPdf && <span className="history-icon-chip history-icon-chip--pdf" aria-label="PDF"><FileText size={11} /></span>}
            </span>
          )}
        </div>
      </div>

      {/* Schmerzwert */}
      {meta?.avgPain !== null && meta?.avgPain !== undefined && (
        <div
          className="history-entry-pain"
          style={{ color: getPainColor(meta.avgPain) }}
        >
          {Math.round(meta.avgPain)}
        </div>
      )}

      <ChevronRight size={16} className="history-entry-chevron" />
    </div>
  );
}

// ─── Dropdown-Primitiv ────────────────────────────────────────────────────────

interface DropdownProps {
  label: string;
  icon: React.ReactNode;
  badge?: number;
  children: React.ReactNode;
}

function Dropdown({ label, icon, badge, children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`history-dropdown-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        {icon}
        <span>{label}</span>
        {badge ? <span className="history-dropdown-badge">{badge}</span> : null}
        <ChevronDown size={14} className={`history-dropdown-chevron${open ? ' rotated' : ''}`} />
      </button>

      {open && (
        <div className="history-dropdown-panel">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── PDF-Export-Dialog ────────────────────────────────────────────────────────

interface PdfDialogProps {
  entryCount: number;
  onClose: () => void;
  onExport: (opts: { imageSize: ImageSize; password: string }) => void;
  isExporting: boolean;
}

function PdfDialog({ entryCount, onClose, onExport, isExporting }: PdfDialogProps) {
  const [imageSize, setImageSize] = useState<ImageSize>('a5');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const pwMatch = pw1 === pw2;

  const imageSizeOptions: { value: ImageSize; label: string }[] = [
    { value: 'a6', label: 'A6 (klein)' },
    { value: 'a5', label: 'A5 (Standard)' },
    { value: 'a4', label: 'A4 (groß)' },
    { value: 'none', label: 'Bilder weglassen' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <CardHeader className="border-b pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base">PDF exportieren</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}><X size={18} /></Button>
          </div>
          <CardDescription>{entryCount} {entryCount === 1 ? 'Eintrag' : 'Einträge'} · Format A4</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* Bildgröße */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Bildgröße im Anhang</Label>
            <div className="grid grid-cols-2 gap-2">
              {imageSizeOptions.map(opt => (
                <button
                  key={opt.value}
                  className={`pdf-size-btn${imageSize === opt.value ? ' selected' : ''}`}
                  onClick={() => setImageSize(opt.value)}
                >
                  {imageSize === opt.value && <Check size={12} />}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Passwortschutz */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Passwortschutz (optional)</Label>
            <Input
              type="password"
              placeholder="Passwort"
              value={pw1}
              onChange={e => setPw1(e.target.value)}
              className="h-9"
            />
            <Input
              type="password"
              placeholder="Passwort wiederholen"
              value={pw2}
              onChange={e => setPw2(e.target.value)}
              className={`h-9 ${pw1 && !pwMatch ? 'border-destructive' : ''}`}
            />
            {pw1 && !pwMatch && (
              <p className="text-xs text-destructive">Passwörter stimmen nicht überein</p>
            )}
          </div>

          <Button
            className="w-full"
            disabled={isExporting || (pw1.length > 0 && !pwMatch)}
            onClick={() => onExport({ imageSize, password: pwMatch ? pw1 : '' })}
          >
            <Download size={16} className="mr-2" />
            {isExporting ? 'Exportiere…' : 'PDF erstellen'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function HistoryView() {
  const { goHome: onBack } = useNavigation();
  const { decrypt } = useDecrypt();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter-State
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [contentFilters, setContentFilters] = useState<ContentFilter[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Sortierung
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  // UI
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [decryptedBlocks, setDecryptedBlocks] = useState<Block[] | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedBlocks, setEditedBlocks] = useState<Block[] | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Metadaten-Cache: nur extrahierte Metadaten, keine Block[]-Arrays im Speicher
  const [metaCache, setMetaCache] = useState<Map<number, ReturnType<typeof extractEntryMeta>>>(new Map());
  const [decryptErrors, setDecryptErrors] = useState<Map<number, string>>(new Map());

  // Eager Decrypt: Metadaten extrahieren, Block[]-Arrays sofort verwerfen
  useEffect(() => {
    let cancelled = false;
    async function decryptAll() {
      const newMeta = new Map<number, ReturnType<typeof extractEntryMeta>>();
      const newErrors = new Map<number, string>();
      for (const entry of entries) {
        if (cancelled || !entry.id) continue;
        try {
          const blocks = await decrypt(entry);
          if (cancelled) break;
          if (blocks === null) {
            if (entry.encrypted) newErrors.set(entry.id, 'Verschlüsselt – bitte neu anmelden');
          } else {
            newMeta.set(entry.id, extractEntryMeta(blocks));
          }
        } catch {
          if (entry.id) newErrors.set(entry.id, 'Entschlüsselung fehlgeschlagen');
        }
      }
      if (!cancelled) {
        setMetaCache(newMeta);
        setDecryptErrors(newErrors);
      }
    }
    decryptAll();
    return () => { cancelled = true; };
  }, [entries, decrypt]);

  // Content-Filter anwenden (client-seitig, da Metadaten entschlüsselte Daten brauchen)
  const visibleEntries = useMemo(() => {
    if (contentFilters.length === 0) return entries;
    return entries.filter(entry => {
      if (!entry.id) return true;
      const meta = metaCache.get(entry.id);
      if (!meta) return true; // noch nicht geladen → optimistisch zeigen
      return contentFilters.every(f => {
        switch (f) {
          case 'events':  return meta.hasEvent;
          case 'doctor':  return meta.hasDoctor;
          case 'bodymap': return meta.hasBodyMap;
          case 'photo':   return meta.hasPhoto;
          case 'pdf':     return meta.hasPdf;
        }
      });
    });
  }, [entries, contentFilters, metaCache]);

  // Alle verfügbaren Tags aus Einträgen
  const allTags = [...new Set(entries.flatMap(e => e.tags ?? []))];

  // Aktive Filter zählen (für Badge)
  const activeFilterCount =
    selectedTemplateIds.length +
    (startDate || endDate ? 1 : 0) +
    contentFilters.length +
    selectedTags.length;

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const allTemplates = await getTemplates();
      setTemplates(allTemplates);
      let allEntries = await getEntries();

      // Template-Filter
      if (selectedTemplateIds.length > 0) {
        allEntries = allEntries.filter(e => selectedTemplateIds.includes(e.templateId));
      }

      // Datum-Filter
      if (startDate) {
        const start = new Date(startDate);
        allEntries = allEntries.filter(e => new Date(e.timestamp) >= start);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        allEntries = allEntries.filter(e => new Date(e.timestamp) <= end);
      }

      // Tag-Filter
      if (selectedTags.length > 0) {
        allEntries = allEntries.filter(e =>
          selectedTags.some(tag => e.tags?.includes(tag))
        );
      }

      // Sortierung
      allEntries = [...allEntries].sort((a, b) => {
        const tA = allTemplates.find(t => t.id === a.templateId)?.name ?? '';
        const tB = allTemplates.find(t => t.id === b.templateId)?.name ?? '';
        switch (sortOption) {
          case 'newest': return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          case 'oldest': return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          case 'template_az': return tA.localeCompare(tB, 'de');
          case 'template_date':
            if (tA !== tB) return tA.localeCompare(tB, 'de');
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        }
      });

      setEntries(allEntries);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTemplateIds, startDate, endDate, sortOption, selectedTags]);

  useEffect(() => { loadData(); }, [loadData]);

  // Detail-Entschlüsselung
  useEffect(() => {
    async function decryptEntry() {
      if (!selectedEntry) { setDecryptedBlocks(null); setDecryptError(null); return; }
      setIsDecrypting(true);
      setDecryptError(null);
      try {
        const blocks = await decrypt(selectedEntry);
        if (blocks === null) {
          setDecryptError('Session abgelaufen – bitte neu anmelden');
          setIsDecrypting(false);
          return;
        }
        setDecryptedBlocks(blocks);
      } catch {
        setDecryptError('Fehler beim Entschlüsseln');
      } finally {
        setIsDecrypting(false);
      }
    }
    decryptEntry();
  }, [selectedEntry, decrypt]);

  function handleCloseModal() {
    setSelectedEntry(null);
    setIsEditMode(false);
    setEditedBlocks(null);
  }

  async function handleDeleteEntry(entryId: number) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    await deleteEntry(entryId);
    handleCloseModal();
    loadData();
  }

  function handleStartEdit() {
    if (!decryptedBlocks) return;
    setEditedBlocks(JSON.parse(JSON.stringify(decryptedBlocks))); // deep copy
    setIsEditMode(true);
  }

  async function handleSaveEdit() {
    if (!selectedEntry?.id || !editedBlocks) return;
    setIsSavingEdit(true);
    try {
      const dataString = JSON.stringify(editedBlocks);
      let encrypted = false;
      let data = dataString;
      let encryptionVersion: number | undefined;

      if (selectedEntry.encrypted) {
        const key = await getSessionKey();
        if (!key) {
          alert('Session abgelaufen – bitte neu anmelden');
          setIsSavingEdit(false);
          return;
        }
        data = await encryptWithKey(dataString, key);
        encrypted = true;
        encryptionVersion = 2;
      }

      const editedAt = new Date().toISOString();
      await updateEntry(selectedEntry.id, data, encrypted, editedAt, encryptionVersion);

      // Update local state
      const updatedEntry: Entry = { ...selectedEntry, data, encrypted, editedAt };
      setSelectedEntry(updatedEntry);
      setDecryptedBlocks(editedBlocks);
      setIsEditMode(false);
      setEditedBlocks(null);
      loadData();
    } catch (error) {
      alert('Fehler beim Speichern: ' + (error instanceof Error ? error.message : 'Unbekannt'));
    } finally {
      setIsSavingEdit(false);
    }
  }

  function handlePresetChange(preset: string) {
    setSelectedPreset(preset);
    const today = new Date();
    const end = today.toISOString().split('T')[0];
    let start: Date;
    switch (preset) {
      case '7days': start = new Date(today); start.setDate(today.getDate() - 7); break;
      case '30days': start = new Date(today); start.setDate(today.getDate() - 30); break;
      case 'thisMonth': start = new Date(today.getFullYear(), today.getMonth(), 1); break;
      case 'lastMonth': {
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(lastEnd.toISOString().split('T')[0]);
        return;
      }
      case 'thisYear': start = new Date(today.getFullYear(), 0, 1); break;
      case 'custom': setStartDate(''); setEndDate(''); return;
      default: setStartDate(''); setEndDate(''); return;
    }
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end);
  }

  function toggleTemplateId(id: number) {
    setSelectedTemplateIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleContentFilter(f: ContentFilter) {
    setContentFilters(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    );
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]
    );
  }

  function resetFilters() {
    setSelectedTemplateIds([]);
    setStartDate('');
    setEndDate('');
    setSelectedPreset('');
    setContentFilters([]);
    setSelectedTags([]);
  }

  async function handleExportPDF({ imageSize, password }: { imageSize: ImageSize; password: string }) {
    if (visibleEntries.length === 0) return;
    setIsExporting(true);
    try {
      const decryptedData = new Map<number, Block[]>();
      for (const entry of visibleEntries) {
        if (!entry.id) continue;
        const blocks = await decrypt(entry);
        if (blocks === null) {
          alert('Session abgelaufen – bitte neu anmelden');
          setIsExporting(false);
          return;
        }
        decryptedData.set(entry.id, blocks);
      }
      await exportToPDF({
        entries: visibleEntries,
        templates,
        decryptedData,
        startDate,
        endDate,
        selectedTemplate: selectedTemplateIds.length === 1
          ? templates.find(t => t.id === selectedTemplateIds[0])?.name
          : undefined,
        imageSize,
        password,
      });
      setShowPdfDialog(false);
    } catch (error) {
      alert('Fehler beim Exportieren: ' + (error instanceof Error ? error.message : 'Unbekannt'));
    } finally {
      setIsExporting(false);
    }
  }

  const sortLabels: Record<SortOption, string> = {
    newest: 'Neueste zuerst',
    oldest: 'Älteste zuerst',
    template_az: 'Vorlage A–Z',
    template_date: 'Vorlage + Datum',
  };

  const contentFilterOptions: { value: ContentFilter; label: string; icon: React.ReactNode }[] = [
    { value: 'events', label: 'Mit Events', icon: <Calendar size={14} /> },
    { value: 'doctor', label: 'Mit Arztterminen', icon: <Stethoscope size={14} /> },
    { value: 'bodymap', label: 'Mit Körperkarte', icon: <MapIcon size={14} /> },
    { value: 'photo', label: 'Mit Fotos', icon: <ImageIcon size={14} /> },
    { value: 'pdf', label: 'Mit PDF', icon: <FileText size={14} /> },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground mt-4">Wird geladen…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
          <button className="floating-btn-glass" onClick={onBack}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-semibold">Verlauf</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">

        {/* ── Filter & Sortierung ── */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Filter-Dropdown */}
          <Dropdown
            label="Filter"
            icon={<Filter size={14} />}
            badge={activeFilterCount || undefined}
          >
            <div className="history-dropdown-content">

              {/* Vorlage */}
              <div className="history-filter-section">
                <p className="history-filter-label">Vorlage</p>
                {templates.map(t => (
                  <label
                    key={t.id}
                    className="history-filter-row"
                    onClick={e => {
                      if ((e.target as HTMLElement).tagName !== 'INPUT') {
                        setSelectedTemplateIds(t.id ? [t.id] : []);
                        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      className="history-checkbox"
                      checked={t.id ? selectedTemplateIds.includes(t.id) : false}
                      onChange={() => t.id && toggleTemplateId(t.id)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span className="history-filter-text">{t.name}</span>
                  </label>
                ))}
              </div>

              <div className="history-filter-divider" />

              {/* Zeitraum */}
              <div className="history-filter-section">
                <p className="history-filter-label">Zeitraum</p>
                <div className="history-filter-row-inline">
                  <CalendarDays size={13} className="text-muted-foreground" />
                  <select
                    className="history-select"
                    value={selectedPreset}
                    onChange={e => handlePresetChange(e.target.value)}
                  >
                    <option value="">Alle</option>
                    <option value="7days">Letzte 7 Tage</option>
                    <option value="30days">Letzte 30 Tage</option>
                    <option value="thisMonth">Dieser Monat</option>
                    <option value="lastMonth">Letzter Monat</option>
                    <option value="thisYear">Dieses Jahr</option>
                    <option value="custom">Benutzerdefiniert</option>
                  </select>
                </div>

                {selectedPreset === 'custom' && (
                  <div className="history-datepicker-row">
                    <div className="history-date-field">
                      <span className="history-date-label">Von</span>
                      <input
                        type="date"
                        className="history-date-input"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="history-date-field">
                      <span className="history-date-label">Bis</span>
                      <input
                        type="date"
                        className="history-date-input"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="history-filter-divider" />

              {/* Inhaltsfilter */}
              <div className="history-filter-section">
                <p className="history-filter-label">Enthält</p>
                {contentFilterOptions.map(opt => (
                  <label key={opt.value} className="history-filter-row">
                    <input
                      type="checkbox"
                      className="history-checkbox"
                      checked={contentFilters.includes(opt.value)}
                      onChange={() => toggleContentFilter(opt.value)}
                    />
                    {opt.icon}
                    <span className="history-filter-text">{opt.label}</span>
                  </label>
                ))}
              </div>

              {/* Tags */}
              {allTags.length > 0 && (
                <>
                  <div className="history-filter-divider" />
                  <div className="history-filter-section">
                    <p className="history-filter-label">Tags</p>
                    <div className="history-tags-grid">
                      {allTags.map(tag => (
                        <button
                          key={tag}
                          className={`history-tag-btn${selectedTags.includes(tag) ? ' selected' : ''}`}
                          onClick={() => toggleTag(tag)}
                        >
                          <Tag size={10} />
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Reset */}
              {activeFilterCount > 0 && (
                <>
                  <div className="history-filter-divider" />
                  <button className="history-reset-btn" onClick={resetFilters}>
                    <X size={13} />
                    Filter zurücksetzen
                  </button>
                </>
              )}
            </div>
          </Dropdown>

          {/* Sortierung-Dropdown */}
          <Dropdown
            label="Sortieren"
            icon={<ArrowUpDown size={14} />}
          >
            <div className="history-dropdown-content">
              <div className="history-filter-section">
                {(Object.entries(sortLabels) as [SortOption, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    className={`history-sort-option${sortOption === key ? ' active' : ''}`}
                    onClick={() => setSortOption(key)}
                  >
                    {sortOption === key && <Check size={13} />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Dropdown>

          {/* Spacer + PDF-Button */}
          <div style={{ marginLeft: 'auto' }}>
            <button
              className="history-pdf-btn"
              disabled={visibleEntries.length === 0}
              onClick={() => setShowPdfDialog(true)}
            >
              <Download size={14} />
              PDF ({visibleEntries.length})
            </button>
          </div>
        </div>

        {/* ── Einträge ── */}
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            {visibleEntries.length} {visibleEntries.length === 1 ? 'Eintrag' : 'Einträge'}
          </p>

          {visibleEntries.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground">Keine Einträge gefunden</p>
            </Card>
          ) : (
            <div className="space-y-2 history-list">
              {visibleEntries.map(entry => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  template={templates.find(t => t.id === entry.templateId)}
                  onClick={() => setSelectedEntry(entry)}
                  meta={entry.id ? metaCache.get(entry.id) : undefined}
                  decryptError={entry.id ? decryptErrors.get(entry.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tutorial */}
        <PageTutorial
          page="history"
          steps={[
            { spotlight: null, text: 'Im Verlauf findest du alle deine bisherigen Tagebucheinträge.', cardPosition: 'center' },
            { spotlight: '.history-list', title: 'Einträge durchstöbern', text: 'Tippe auf einen Eintrag, um ihn zu öffnen. Mit den Filtern oben kannst du nach Vorlage oder Zeitraum einschränken.', cardPosition: 'auto' },
            { spotlight: null, title: 'PDF-Export', text: 'Mit dem Download-Button kannst du deine Einträge als PDF exportieren – praktisch für Arzttermine.', cardPosition: 'center' },
          ]}
        />
      </div>

      {/* ── PDF-Dialog ── */}
      {showPdfDialog && (
        <PdfDialog
          entryCount={entries.length}
          onClose={() => setShowPdfDialog(false)}
          onExport={handleExportPDF}
          isExporting={isExporting}
        />
      )}

      {/* ── Detail-Modal ── */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={isEditMode ? undefined : handleCloseModal}>
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <CardHeader className="border-b">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>
                    {templates.find(t => t.id === selectedEntry.templateId)?.name}
                    {isEditMode && <span className="ml-2 text-sm font-normal text-muted-foreground">(Bearbeiten)</span>}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {new Date(selectedEntry.timestamp).toLocaleDateString('de-DE', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {selectedEntry.editedAt && (
                      <span className="ml-2 text-xs">
                        · bearbeitet {new Date(selectedEntry.editedAt).toLocaleDateString('de-DE', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={handleCloseModal}>
                  <X size={20} />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-6">
              {isDecrypting ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
                  <p className="text-muted-foreground mt-4">Entschlüssele…</p>
                </div>
              ) : decryptError ? (
                <p className="text-destructive">{decryptError}</p>
              ) : isEditMode && editedBlocks ? (
                <div className="space-y-4">
                  {editedBlocks.map((block, idx) => (
                    <BlockRenderer
                      key={block.id}
                      block={block}
                      onChange={(newValue) => {
                        const updated = [...editedBlocks];
                        updated[idx] = { ...block, value: newValue };
                        setEditedBlocks(updated);
                      }}
                      readOnly={false}
                    />
                  ))}
                </div>
              ) : decryptedBlocks ? (
                <div className="space-y-4">
                  {decryptedBlocks.map(block => (
                    <BlockRenderer key={block.id} block={block} onChange={() => {}} readOnly={true} />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Keine Daten vorhanden</p>
              )}
            </CardContent>

            <div className="border-t p-4 flex justify-between gap-2 flex-shrink-0">
              {isEditMode ? (
                <>
                  <Button variant="outline" onClick={() => { setIsEditMode(false); setEditedBlocks(null); }}>
                    Abbrechen
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
                    <Save size={16} className="mr-2" />
                    {isSavingEdit ? 'Speichern…' : 'Speichern'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={handleCloseModal}>Schließen</Button>
                  <div className="flex gap-2">
                    {decryptedBlocks && (
                      <Button variant="outline" onClick={handleStartEdit}>
                        <Pencil size={16} className="mr-2" />
                        Bearbeiten
                      </Button>
                    )}
                    <Button variant="destructive" onClick={() => selectedEntry.id && handleDeleteEntry(selectedEntry.id)}>
                      <Trash2 size={16} className="sm:mr-2" />
                      <span className="hidden sm:inline">Löschen</span>
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
