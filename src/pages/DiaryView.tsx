import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import type { Block, BlockValue } from '../types/blocks';
import type { Template } from '../types/database';
import db from '../db';
import { getEncryptionMode, getSessionPassword, refreshSession } from '../utils/auth';
import { encryptData } from '../utils/crypto';
import BlockRenderer from '../components/BlockRenderer';
import { getIconComponent } from '../utils/iconUtils';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Menu, History, Settings, TrendingUp, Paintbrush } from 'lucide-react';
import { cn } from "@/lib/utils";

interface DiaryViewProps {
  onNavigate: (view: 'editor' | 'history' | 'diary' | 'settings' | 'dashboard') => void;
  onEditTemplate?: (templateId: number) => void;
}

export default function DiaryView({ onNavigate, onEditTemplate }: DiaryViewProps) {
  // State
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [currentBlocks, setCurrentBlocks] = useState<Block[]>([]);
  const [originalBlocks, setOriginalBlocks] = useState<Block[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [showPersonalizeBtn, setShowPersonalizeBtn] = useState(false);
  const [isHidingBtn, setIsHidingBtn] = useState(false);
  
  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const accumulatedDeltaRef = useRef(0);
  const inactivityTimeoutRef = useRef<number | null>(null);
  const showPersonalizeBtnRef = useRef(showPersonalizeBtn);

  // Update ref when state changes
  useEffect(() => {
    showPersonalizeBtnRef.current = showPersonalizeBtn;
  }, [showPersonalizeBtn]);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  // Reset form when template changes
  useEffect(() => {
    if (templates.length > 0 && activeTabIndex < templates.length) {
      const newBlocks = JSON.parse(JSON.stringify(templates[activeTabIndex].blocks));
      setCurrentBlocks(newBlocks);
      setOriginalBlocks(newBlocks);
      setHasUnsavedChanges(false);
      setShowPersonalizeBtn(false);
      setIsHidingBtn(false);
      accumulatedDeltaRef.current = 0;
    }
  }, [activeTabIndex, templates]);

  // Detect unsaved changes
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

  // Pull-to-Reveal Logic
  useLayoutEffect(() => {
    const initTimeout = setTimeout(() => {
      const container = contentRef.current;
      if (!container) {
        console.log('🚫 Container STILL not found after timeout!');
        return;
      }

      console.log('✅ Pull-to-Reveal Logic mounted!');

      const TOUCH_THRESHOLD = 80;
      const WHEEL_THRESHOLD = 270; // GEÄNDERT: 1/3 von 800
      let touchStartY = 0;
      let isPulling = false;

      const isAtBottom = () => {
        const isScrollable = container.scrollHeight > container.clientHeight;
        const atBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
        return !isScrollable || atBottom;
      };

      const resetInactivityTimeout = () => {
        if (inactivityTimeoutRef.current) {
          clearTimeout(inactivityTimeoutRef.current);
        }
        inactivityTimeoutRef.current = window.setTimeout(() => {
          accumulatedDeltaRef.current = 0;
        }, 2000);
      };

      // TOUCH EVENTS (Mobile) - RICHTUNG UMGEKEHRT!
      const handleTouchStart = (e: TouchEvent) => {
        if (isAtBottom()) {
          touchStartY = e.touches[0].clientY;
          isPulling = true;
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (!isPulling) return;
        
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - touchStartY;
        const currentShowBtn = showPersonalizeBtnRef.current;

        // Pull UP (negativ): Button erscheinen - nach OBEN ziehen!
        if (deltaY < -TOUCH_THRESHOLD && !currentShowBtn) {
          setShowPersonalizeBtn(true);
          setIsHidingBtn(false);
          isPulling = false;
          if (navigator.vibrate) navigator.vibrate(50);
        } 
        // Pull DOWN (positiv): Button verstecken - nach UNTEN ziehen!
        else if (deltaY > TOUCH_THRESHOLD && currentShowBtn) {
          setIsHidingBtn(true);
          isPulling = false;
          setTimeout(() => {
            setShowPersonalizeBtn(false);
            setIsHidingBtn(false);
          }, 400);
          if (navigator.vibrate) navigator.vibrate(30);
        }
      };

      const handleTouchEnd = () => {
        isPulling = false;
      };

      // WHEEL EVENTS (Desktop)
      const handleWheel = (e: WheelEvent) => {
        if (!isAtBottom()) {
          accumulatedDeltaRef.current = 0;
          return;
        }

        accumulatedDeltaRef.current += e.deltaY;
        resetInactivityTimeout();
        const currentShowBtn = showPersonalizeBtnRef.current;

        // Scroll down: Button erscheinen
        if (accumulatedDeltaRef.current > WHEEL_THRESHOLD && !currentShowBtn) {
          setShowPersonalizeBtn(true);
          setIsHidingBtn(false);
          accumulatedDeltaRef.current = 0;
        } 
        // Scroll up: Button verstecken
        else if (accumulatedDeltaRef.current < -WHEEL_THRESHOLD && currentShowBtn) {
          setIsHidingBtn(true);
          accumulatedDeltaRef.current = 0;
          setTimeout(() => {
            setShowPersonalizeBtn(false);
            setIsHidingBtn(false);
          }, 400);
        }
      };

      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: true });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
      container.addEventListener('wheel', handleWheel, { passive: true });

      console.log('✅ Event listeners attached!');
    }, 100);

    return () => {
      clearTimeout(initTimeout);
    };
  }, []);

  async function loadTemplates() {
    const allTemplates = await db.templates.orderBy('order').toArray();
    setTemplates(allTemplates);
  }

  function handleBlockChange(blockId: string, value: BlockValue) {
    setCurrentBlocks(prev => 
      prev.map(block => 
        block.id === blockId ? { ...block, value } : block
      )
    );
  }

  function handleDashboardConfigChange(blockId: string, config: { eventCategory: 'event' | 'doctor'; eventTitle: string }) {
    setCurrentBlocks(prev => 
      prev.map(block => {
        if (block.id === blockId) {
          return {
            ...block,
            dashboard: {
              ...block.dashboard,
              enabled: block.dashboard?.enabled || false,
              eventCategory: config.eventCategory,
              eventTitle: config.eventTitle
            }
          };
        }
        return block;
      })
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
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handlePersonalize() {
    const currentTemplate = templates[activeTabIndex];
    if (!currentTemplate?.id) return;

    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        '⚠️ Du hast ungespeicherte Änderungen!\n\nMöchtest du zum Template-Editor wechseln? Alle Änderungen gehen verloren.'
      );
      if (!confirmed) return;
    }

    if (onEditTemplate) {
      onEditTemplate(currentTemplate.id);
    } else {
      onNavigate('editor');
    }
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
      
      setFormKey(prev => prev + 1);
      setCurrentBlocks(JSON.parse(JSON.stringify(templates[activeTabIndex].blocks)));
      setOriginalBlocks(JSON.parse(JSON.stringify(templates[activeTabIndex].blocks)));
      setHasUnsavedChanges(false);
      
      if (contentRef.current) {
        contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
      alert('Fehler beim Speichern des Eintrags');
    } finally {
      setIsSaving(false);
    }
  }

  if (templates.length === 0) {
    return (
      <div className="min-h-screen pb-18 px-5 pt-16">
        <div className="floating-buttons-container">
          <button className="floating-btn-glass" onClick={() => setShowMenu(!showMenu)}>
            <Menu size={18} />
          </button>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center">
            <p className="text-lg font-semibold mb-2">Keine Templates vorhanden</p>
            <p className="text-sm text-muted-foreground mb-4">
              Erstelle zuerst ein Template im Template-Editor.
            </p>
            <Button onClick={() => onNavigate('editor')} variant="outline">
              Zum Template-Editor
            </Button>
          </Card>
        </div>

        {showMenu && (
          <>
            <div className="fixed inset-0 bg-black/30 z-20" onClick={() => setShowMenu(false)} />
            <Card className="fixed top-16 right-4 z-40 p-2 shadow-xl min-w-[240px] border-2">
              <div className="space-y-1">
                <Button onClick={() => { setShowMenu(false); onNavigate('history'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                  <History size={18} /><span className="font-medium">Verlauf anzeigen</span>
                </Button>
                <Button onClick={() => { setShowMenu(false); onNavigate('dashboard'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                  <TrendingUp size={18} /><span className="font-medium">Dashboard</span>
                </Button>
                <Button onClick={() => { setShowMenu(false); onNavigate('settings'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                  <Settings size={18} /><span className="font-medium">Einstellungen</span>
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>
    );
  }

  const activeTemplate = templates[activeTabIndex];

  return (
    <div className="flex flex-col h-screen">
      <div className={cn("floating-buttons-container", hasUnsavedChanges && "has-save")}>
        <button className="floating-btn-glass" onClick={() => setShowMenu(!showMenu)}>
          <Menu size={20} />
        </button>
        
        {hasUnsavedChanges && (
          <button
            className="floating-btn-glass save-btn floating-btn-enter animate-pulse-glow-green"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Check size={20} />
          </button>
        )}
      </div>

      <div className="fixed top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="max-w-2xl mx-auto px-5 py-2 flex items-center justify-center">
          <h1 className="text-base font-semibold">{activeTemplate?.name || 'Tagebuch'}</h1>
        </div>
      </div>

      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto pb-18 px-5 pt-16"
        style={{ 
          scrollBehavior: 'smooth',
          touchAction: 'manipulation'
        }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="space-y-3" key={formKey}>
            {currentBlocks.map(block => (
              <BlockRenderer
                key={block.id}
                block={block}
                onChange={(value) => handleBlockChange(block.id, value)}
                onDashboardConfigChange={handleDashboardConfigChange}
                hideLabel={block.hideLabelInDiary}
              />
            ))}
          </div>

          {showPersonalizeBtn && (
            <div className={cn("mt-8 pt-6 border-t border-gray-200", isHidingBtn ? "animate-slide-down" : "animate-slide-up")}>
              <button
                onClick={handlePersonalize}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 personalize-btn-revealed animate-pulse-glow"
              >
                <Paintbrush size={18} style={{ color: '#6366f1' }} />
                <span className="font-medium">Seite personalisieren</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {showSuccess && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">Eintrag gespeichert</span>
        </div>
      )}

      <nav className="bottom-nav-glass">
        <div className="template-tabs-scroll">
          {templates.map((template, index) => {
            const IconComponent = getIconComponent(template.icon);
            const isActive = index === activeTabIndex;
            
            return (
              <button
                key={template.id}
                className={cn("template-icon-btn", isActive && "template-icon-btn-active")}
                onClick={() => handleTemplateChange(index)}
              >
                <IconComponent size={20} />
              </button>
            );
          })}
        </div>
      </nav>

      {showMenu && (
        <>
          <div className="fixed inset-0 bg-black/30 z-20" onClick={() => setShowMenu(false)} />
          <Card className="fixed top-16 right-4 z-40 p-2 shadow-xl min-w-[240px] border-2">
            <div className="space-y-1">
              <Button onClick={() => { setShowMenu(false); onNavigate('history'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                <History size={18} /><span className="font-medium">Verlauf anzeigen</span>
              </Button>
              <Button onClick={() => { setShowMenu(false); onNavigate('dashboard'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                <TrendingUp size={18} /><span className="font-medium">Dashboard</span>
              </Button>
              <Button onClick={() => { setShowMenu(false); onNavigate('settings'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                <Settings size={18} /><span className="font-medium">Einstellungen</span>
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
