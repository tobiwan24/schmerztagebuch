import { useState, useEffect } from 'react';
import type { Block } from '../types/blocks';
import type { Template } from '../types/database';
import db from '../db';
import { getEncryptionMode, getSessionPassword, refreshSession } from '../utils/auth';
import { encryptData } from '../utils/crypto';
import BlockRenderer from '../components/BlockRenderer';
import { getIconComponent } from '../components/TemplateStylePicker';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Save, Menu, Edit, History, Settings } from 'lucide-react';
import { cn } from "@/lib/utils";

interface DiaryViewProps {
  onNavigate: (view: 'editor' | 'history' | 'diary' | 'settings') => void;
}

export default function DiaryView({ onNavigate }: DiaryViewProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [currentBlocks, setCurrentBlocks] = useState<Block[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalBlocks, setOriginalBlocks] = useState<Block[]>([]);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (templates.length > 0 && activeTabIndex < templates.length) {
      const newBlocks = JSON.parse(JSON.stringify(templates[activeTabIndex].blocks));
      setCurrentBlocks(newBlocks);
      setOriginalBlocks(newBlocks);
      setHasUnsavedChanges(false);
    }
  }, [activeTabIndex, templates]);

  useEffect(() => {
    const hasChanges = currentBlocks.some(block => {
      const original = originalBlocks.find(b => b.id === block.id);
      if (!original) return false;
      
      if (block.value === undefined || block.value === null || block.value === '') return false;
      if (Array.isArray(block.value) && block.value.length === 0) return false;
      
      return JSON.stringify(block.value) !== JSON.stringify(original.value);
    });
    
    setHasUnsavedChanges(hasChanges);
  }, [currentBlocks, originalBlocks]);

  async function loadTemplates() {
    const allTemplates = await db.templates.orderBy('order').toArray();
    setTemplates(allTemplates);
  }

  function handleBlockChange(blockId: string, value: string | number | boolean | string[]) {
    setCurrentBlocks(prev => 
      prev.map(block => 
        block.id === blockId ? { ...block, value } : block
      )
    );
  }

  function handleTemplateChange(newIndex: number) {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        '⚠️ Du hast ungespeicherte Änderungen!\n\nMöchtest du wirklich das Template wechseln? Alle Änderungen gehen verloren.'
      );
      if (!confirmed) return;
    }
    
    setActiveTabIndex(newIndex);
  }

  async function handleSave() {
    if (!templates[activeTabIndex]?.id) return;
    
    setIsSaving(true);
    try {
      const mode = await getEncryptionMode();
      
      const blocksToSave = currentBlocks.filter(block => {
        if (block.value === undefined || block.value === null) return false;
        if (typeof block.value === 'string' && block.value.trim() === '') return false;
        if (Array.isArray(block.value) && block.value.length === 0) return false;
        return true;
      });
      
      if (blocksToSave.length === 0) {
        alert('Bitte fülle mindestens ein Feld aus!');
        setIsSaving(false);
        return;
      }
      
      let data: string;
      let encrypted = false;
      
      if (mode !== 'none') {
        const password = getSessionPassword();
        
        if (!password) {
          alert('⚠️ Fehler: Session nicht vorhanden. Bitte App neu starten.');
          setIsSaving(false);
          return;
        }
        
        refreshSession();
        
        const jsonData = JSON.stringify(blocksToSave);
        data = await encryptData(jsonData, password);
        encrypted = true;
      } else {
        data = JSON.stringify(blocksToSave);
      }
      
      const tags: string[] = [];
      
      blocksToSave.forEach(block => {
        if (block.type === 'multiselect' && Array.isArray(block.value)) {
          tags.push(...block.value);
        }
      });
      
      await db.entries.add({
        templateId: templates[activeTabIndex].id!,
        timestamp: new Date(),
        encrypted,
        data,
        tags
      });
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      
      setCurrentBlocks(JSON.parse(JSON.stringify(templates[activeTabIndex].blocks)));
      setOriginalBlocks(JSON.parse(JSON.stringify(templates[activeTabIndex].blocks)));
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern des Eintrags');
    } finally {
      setIsSaving(false);
    }
  }

  if (templates.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">Keine Templates gefunden</p>
        </Card>
      </div>
    );
  }

  const activeTemplate = templates[activeTabIndex];

  return (
    <div className="min-h-screen pb-28 px-4 pt-4">
      {/* Content */}
      <div className="max-w-2xl mx-auto">
        <Card className="p-6">
          <div className="space-y-6">
            {currentBlocks.map(block => (
              <BlockRenderer
                key={block.id}
                block={block}
                onChange={(value) => handleBlockChange(block.id, value)}
                hideLabel={block.hideLabelInDiary}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">Eintrag gespeichert</span>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-md z-30">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between gap-3">
            {/* Left Side - Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10 rounded-full flex-shrink-0"
              onClick={() => setShowMenu(!showMenu)}
            >
              <Menu size={18} />
            </Button>

            {/* Center - Template Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto flex-1 justify-center scrollbar-hide py-1">
              {templates
                .slice(0, activeTabIndex)
                .reverse()
                .map((template) => {
                  const IconComponent = getIconComponent(template.icon);
                  const originalIndex = templates.indexOf(template);
                  const hasCustomColor = template.color && template.color.trim() !== '';
                  
                  return (
                    <div
                      key={template.id}
                      className="template-button-wrapper"
                      data-has-color={hasCustomColor ? "true" : "false"}
                      style={hasCustomColor ? { '--template-bg': template.color } as React.CSSProperties : undefined}
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleTemplateChange(originalIndex)}
                        className={cn(
                          "w-10 h-10 rounded-full flex-shrink-0 transition-all hover:scale-105",
                          hasCustomColor && "template-button-custom"
                        )}
                      >
                        <IconComponent size={16} />
                      </Button>
                    </div>
                  );
                })}

              {/* ACTIVE Template */}
              <div
                className="template-button-wrapper"
                data-has-color={activeTemplate.color && activeTemplate.color.trim() !== '' ? "true" : "false"}
                style={activeTemplate.color && activeTemplate.color.trim() !== '' ? { '--template-bg': activeTemplate.color } as React.CSSProperties : undefined}
              >
                <Button
                  variant="default"
                  size="icon"
                  className={cn(
                    "w-11 h-11 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-primary/40 transition-all",
                    activeTemplate.color && activeTemplate.color.trim() !== '' && "template-button-active-custom"
                  )}
                >
                  {(() => {
                    const IconComponent = getIconComponent(activeTemplate.icon);
                    return <IconComponent size={20} />;
                  })()}
                </Button>
              </div>

              {templates.slice(activeTabIndex + 1).map((template) => {
                const IconComponent = getIconComponent(template.icon);
                const originalIndex = templates.indexOf(template);
                const hasCustomColor = template.color && template.color.trim() !== '';
                
                return (
                  <div
                    key={template.id}
                    className="template-button-wrapper"
                    data-has-color={hasCustomColor ? "true" : "false"}
                    style={hasCustomColor ? { '--template-bg': template.color } as React.CSSProperties : undefined}
                  >
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleTemplateChange(originalIndex)}
                      className={cn(
                        "w-10 h-10 rounded-full flex-shrink-0 transition-all hover:scale-105",
                        hasCustomColor && "template-button-custom"
                      )}
                    >
                      <IconComponent size={16} />
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Right Side - Save Button */}
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="icon"
              className="w-10 h-10 rounded-full relative flex-shrink-0 bg-green-600 hover:bg-green-700 text-white"
            >
              <Save size={18} />
              {hasUnsavedChanges && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-card animate-pulse" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Menu Dropdown */}
      {showMenu && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-20"
            onClick={() => setShowMenu(false)}
          />
          <Card className="fixed bottom-24 left-4 z-40 p-2 shadow-xl min-w-[240px] border-2">
            <div className="space-y-1">
              <Button
                onClick={() => {
                  setShowMenu(false);
                  onNavigate('editor');
                }}
                variant="ghost"
                className="w-full justify-start gap-3 h-11"
              >
                <Edit size={18} />
                <span className="font-medium">Templates bearbeiten</span>
              </Button>
              <Button
                onClick={() => {
                  setShowMenu(false);
                  onNavigate('history');
                }}
                variant="ghost"
                className="w-full justify-start gap-3 h-11"
              >
                <History size={18} />
                <span className="font-medium">Verlauf anzeigen</span>
              </Button>
              <Button
                onClick={() => {
                  setShowMenu(false);
                  onNavigate('settings');
                }}
                variant="ghost"
                className="w-full justify-start gap-3 h-11"
              >
                <Settings size={18} />
                <span className="font-medium">Einstellungen</span>
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
