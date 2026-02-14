import { useState, useRef } from 'react';
import type { Block, TextAreaBlockValue, AttachedFile } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { CalendarClock, Stethoscope, Camera, FileText, X, Check } from 'lucide-react';

interface TextAreaBlockProps {
  block: Block;
  onChange: (value: TextAreaBlockValue) => void;
  onDashboardConfigChange?: (config: { eventCategory: 'event' | 'doctor'; eventTitle: string }) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

// Helper: File to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

// Helper: Generate UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export default function TextAreaBlock({ 
  block, 
  onChange, 
  onDashboardConfigChange,
  readOnly = false, 
  hideLabel = false 
}: TextAreaBlockProps) {
  // Parse block value
  const blockValue = typeof block.value === 'string' 
    ? { text: block.value } as TextAreaBlockValue
    : (block.value as TextAreaBlockValue) || {};

  const [textValue, setTextValue] = useState<string>(blockValue.text || '');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>(blockValue.attachedFiles || []);
  const [showEventConfig, setShowEventConfig] = useState(false);
  const [eventCategory, setEventCategory] = useState<'event' | 'doctor'>(
    block.dashboard?.eventCategory || 'event'
  );
  const [eventTitle, setEventTitle] = useState(block.dashboard?.eventTitle || '');
  
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setTextValue(newText);
    onChange({
      text: newText,
      attachedFiles: attachedFiles
    });
  };

  const handleFileUpload = async (files: FileList | null, type: 'image' | 'pdf') => {
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Validierung
    if (type === 'image' && !file.type.startsWith('image/')) {
      alert('Bitte wähle eine Bilddatei aus');
      return;
    }
    if (type === 'pdf' && file.type !== 'application/pdf') {
      alert('Bitte wähle eine PDF-Datei aus');
      return;
    }

    try {
      const base64Data = await fileToBase64(file);
      const newFile: AttachedFile = {
        id: generateUUID(),
        name: file.name,
        type: type,
        data: base64Data,
        createdAt: new Date().toISOString()
      };

      const updatedFiles = [...attachedFiles, newFile];
      setAttachedFiles(updatedFiles);
      onChange({
        text: textValue,
        attachedFiles: updatedFiles
      });
    } catch (error) {
      console.error('File upload error:', error);
      alert('Fehler beim Hochladen der Datei');
    }
  };

  const handleDeleteFile = (fileId: string) => {
    const updatedFiles = attachedFiles.filter(f => f.id !== fileId);
    setAttachedFiles(updatedFiles);
    onChange({
      text: textValue,
      attachedFiles: updatedFiles
    });
  };

  const handleSaveEventConfig = () => {
    if (!eventTitle.trim()) {
      alert('Bitte einen Titel eingeben');
      return;
    }
    
    if (onDashboardConfigChange) {
      onDashboardConfigChange({
        eventCategory,
        eventTitle: eventTitle.trim()
      });
    }
    
    setShowEventConfig(false);
  };

  const handleCancelEventConfig = () => {
    setShowEventConfig(false);
    setEventTitle(block.dashboard?.eventTitle || '');
    setEventCategory(block.dashboard?.eventCategory || 'event');
  };

  const isDashboardEnabled = block.dashboard?.enabled;
  const hasEventConfig = block.dashboard?.eventTitle;

  return (
    <div className="space-y-2">
      {!hideLabel && <Label>{block.label}</Label>}
      <Textarea
        value={textValue}
        onChange={handleChange}
        readOnly={readOnly}
        disabled={readOnly}
        rows={4}
        className="resize-none"
        placeholder="Notizen eingeben..."
      />

      {/* File Upload Buttons - Immer sichtbar (nicht nur wenn Dashboard aktiv) */}
      {!readOnly && (
        <div className="flex gap-3" style={{ marginTop: '12px' }}>
          {/* Event Button */}
          <Button
            type="button"
            onClick={() => {
              setEventCategory('event');
              setShowEventConfig(true);
            }}
            variant="outline"
            size="icon"
            className="btn-touch-target"
            title="Event hinzufügen"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <CalendarClock size={22} />
          </Button>

          {/* Doctor Button */}
          <Button
            type="button"
            onClick={() => {
              setEventCategory('doctor');
              setShowEventConfig(true);
            }}
            variant="outline"
            size="icon"
            className="btn-touch-target"
            title="Arztbesuch hinzufügen"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <Stethoscope size={22} />
          </Button>

          {/* Photo Button */}
          <Button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            variant="outline"
            size="icon"
            className="btn-touch-target"
            title="Foto hinzufügen"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <Camera size={22} />
          </Button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileUpload(e.target.files, 'image')}
            style={{ display: 'none' }}
          />

          {/* PDF Button */}
          <Button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            variant="outline"
            size="icon"
            className="btn-touch-target"
            title="PDF hinzufügen"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <FileText size={22} />
          </Button>
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => handleFileUpload(e.target.files, 'pdf')}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* File Preview Grid */}
      {attachedFiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2" style={{ marginTop: '12px' }}>
          {attachedFiles.map((file) => (
            <Card key={file.id} className="p-2 relative">
              {file.type === 'image' ? (
                <img
                  src={file.data}
                  alt={file.name}
                  className="w-full h-24 object-cover rounded"
                />
              ) : (
                <div className="w-full h-24 flex flex-col items-center justify-center bg-secondary/20 rounded">
                  <FileText size={32} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground mt-1 text-center px-1 truncate w-full">
                    {file.name}
                  </p>
                </div>
              )}
              {!readOnly && (
                <Button
                  type="button"
                  onClick={() => handleDeleteFile(file.id)}
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6"
                >
                  <X size={12} />
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
      
      {/* Event-Config nur wenn Dashboard aktiv */}
      {!readOnly && isDashboardEnabled && onDashboardConfigChange && (
        <div className="space-y-2">
          {/* Bereits konfiguriert - Anzeige */}
          {hasEventConfig && !showEventConfig && (
            <Card className="p-2 bg-secondary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {block.dashboard?.eventCategory === 'doctor' ? (
                    <Stethoscope size={12} className="text-primary" />
                  ) : (
                    <CalendarClock size={12} className="text-primary" />
                  )}
                  <div>
                    <p className="text-xs font-semibold">
                      {block.dashboard?.eventCategory === 'doctor' ? 'Arztbesuch' : 'Event'}
                    </p>
                    <p className="text-xs text-muted-foreground">{block.dashboard?.eventTitle}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    if (onDashboardConfigChange) {
                      onDashboardConfigChange({ eventCategory: 'event', eventTitle: '' });
                    }
                  }}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                >
                  <X size={12} />
                </Button>
              </div>
            </Card>
          )}
          
          {/* Event-Konfigurations-Popup - Kompakt */}
          {showEventConfig && (
            <Card className="p-3 border-2 border-primary">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    {eventCategory === 'doctor' ? '🩺 Arztbesuch' : '⚡ Event'}
                  </Label>
                  <Button
                    type="button"
                    onClick={handleCancelEventConfig}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                  >
                    <X size={12} />
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Input
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Titel eingeben..."
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveEventConfig();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={handleSaveEventConfig}
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <Check size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
