import { useRef, useState, useEffect } from 'react';
import { Camera, FileText, X } from 'lucide-react';
import type { Block } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface UploadedFile {
  id: string;
  data: string;
  type: 'image' | 'pdf';
  name: string;
}

interface ImageBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function ImageBlock({ block, onChange, readOnly = false, hideLabel = false }: ImageBlockProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const isInitialMount = useRef(true);
  
  // Im Editor (hideLabel=true) keine Uploads erlauben
  const effectiveReadOnly = readOnly || hideLabel;

  useEffect(() => {
    if (block.value && typeof block.value === 'string') {
      try {
        const parsed = JSON.parse(block.value);
        if (Array.isArray(parsed)) {
          setFiles(parsed);
        }
      } catch {
        if (block.value.startsWith('data:image')) {
          setFiles([{
            id: 'legacy',
            data: block.value,
            type: 'image',
            name: 'Foto'
          }]);
        }
      }
    }
  }, [block.value]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    onChange(JSON.stringify(files));
  }, [files, onChange]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    Array.from(fileList).forEach(file => {
      if (!file.type.startsWith('image/')) {
        alert('Bitte nur Bilder hochladen!');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert('Bild ist zu groß! Maximal 5MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const newFile: UploadedFile = {
          id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          data: base64,
          type: 'image',
          name: file.name
        };
        setFiles(prev => [...prev, newFile]);
      };
      reader.readAsDataURL(file);
    });

    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Bitte nur PDF-Dateien hochladen!');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('PDF ist zu groß! Maximal 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const newFile: UploadedFile = {
        id: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        data: base64,
        type: 'pdf',
        name: file.name
      };
      setFiles(prev => [...prev, newFile]);
    };
    reader.readAsDataURL(file);

    if (pdfInputRef.current) {
      pdfInputRef.current.value = '';
    }
  };

  const handleDelete = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  return (
    <div className="space-y-3">
      {!hideLabel && <Label>{block.label}</Label>}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleImageSelect}
        disabled={effectiveReadOnly}
        className="hidden"
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        onChange={handlePdfSelect}
        disabled={effectiveReadOnly}
        className="hidden"
      />

      <div className="flex gap-2">
        <Button
          onClick={() => imageInputRef.current?.click()}
          disabled={effectiveReadOnly}
          variant="outline"
          type="button"
          className="flex-1"
        >
          <Camera size={18} className="mr-2" />
          <span>Foto</span>
        </Button>
        
        <Button
          onClick={() => pdfInputRef.current?.click()}
          disabled={effectiveReadOnly}
          variant="outline"
          type="button"
          className="flex-1"
        >
          <FileText size={18} className="mr-2" />
          <span>PDF</span>
        </Button>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map(file => (
            <Card key={file.id} className="relative p-2">
              {file.type === 'image' ? (
                <img 
                  src={file.data} 
                  alt={file.name}
                  className="w-full h-24 object-cover rounded"
                />
              ) : (
                <div className="w-full h-24 flex flex-col items-center justify-center bg-secondary/30 rounded">
                  <FileText size={32} className="text-destructive" />
                  <span className="text-xs mt-1 text-center truncate w-full px-1">
                    {file.name}
                  </span>
                </div>
              )}
              
              {!effectiveReadOnly && (
                <Button
                  onClick={() => handleDelete(file.id)}
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full"
                  type="button"
                >
                  <X size={14} />
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
