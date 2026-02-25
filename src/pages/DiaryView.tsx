import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import type { Block, BlockValue } from '../types/blocks';
import type { Template } from '../types/database';
import db, { createTemplate } from '../db';
import { getEncryptionMode, getSessionPassword, refreshSession } from '../utils/auth';
import { encryptData } from '../utils/crypto';
import BlockRenderer from '../components/BlockRenderer';
import { getIconComponent } from '../utils/iconUtils';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Menu, History, Settings, TrendingUp, Paintbrush, Plus, ArrowLeft } from 'lucide-react';
import { cn } from "@/lib/utils";
import PageTutorial from '../components/tutorial/PageTutorial';

interface DiaryViewProps {
  onNavigate: (view: 'editor' | 'history' | 'diary' | 'settings' | 'dashboard') => void;
  onEditTemplate?: (templateId: number) => void;
  onBack?: () => void;
  initialActiveTemplateId?: number;
}

export default function DiaryView({ onNavigate, onEditTemplate, onBack, initialActiveTemplateId }: DiaryViewProps) {
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
  const [forceTutorialSaveBtn, setForceTutorialSaveBtn] = useState(false);
  
  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const accumulatedDeltaRef = useRef(0);
  const inactivityTimeoutRef = useRef<number | null>(null);
  const showPersonalizeBtnRef = useRef(showPersonalizeBtn);

  // Update ref when state changes
  useEffect(() => {
    showPersonalizeBtnRef.current = showPersonalizeBtn;
  }, [showPersonalizeBtn]);

  // Load templates on mount and when returning from editor
  useEffect(() => {
    loadTemplates();
  }, [initialActiveTemplateId]);

  // Set active template from initialActiveTemplateId and scroll to top
  useEffect(() => {
    if (initialActiveTemplateId && templates.length > 0) {
      const templateIndex = templates.findIndex(t => t.id === initialActiveTemplateId);
      if (templateIndex !== -1) {
        setActiveTabIndex(templateIndex);
        // Scroll to top when returning from editor
        if (contentRef.current) {
          contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    }
  }, [initialActiveTemplateId, templates]);

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
    let containerCleanup: (() => void) | undefined;
    const initTimeout = setTimeout(() => {
      const container = contentRef.current;
      if (!container) {
        return;
      }

      const TOUCH_THRESHOLD = 80;
      const WHEEL_THRESHOLD = 270;
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

      // TOUCH EVENTS - passive: false für preventDefault()
      const handleTouchStart = (e: TouchEvent) => {
        // Prüfe ob Touch auf Bottom Nav Bar ist - wenn ja, ignoriere
        const target = e.target as HTMLElement;
        if (target.closest('.bottom-nav-glass') || target.closest('.template-tabs-scroll')) {
          return; // Lasse Bottom Nav ihr eigenes Touch-Handling machen
        }
        
        const atBottom = isAtBottom();
        const currentShowBtn = showPersonalizeBtnRef.current;
        touchStartY = e.touches[0].clientY;
        
        if (atBottom || currentShowBtn) {
          isPulling = true;
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        // Prüfe ob Touch auf Bottom Nav Bar ist - wenn ja, ignoriere
        const target = e.target as HTMLElement;
        if (target.closest('.bottom-nav-glass') || target.closest('.template-tabs-scroll')) {
          return; // Lasse Bottom Nav ihr eigenes Touch-Handling machen
        }
        
        if (!isPulling) return;
        
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - touchStartY;
        const currentShowBtn = showPersonalizeBtnRef.current;
        const atBottom = isAtBottom();

        // FIX 2b: Button sichtbar UND Pull DOWN → preventDefault()
        if (currentShowBtn && deltaY > 0) {
          e.preventDefault(); // Blockiere Browser-Scroll!
          
          if (deltaY > TOUCH_THRESHOLD) {
            setIsHidingBtn(true);
            isPulling = false;
            setTimeout(() => {
              setShowPersonalizeBtn(false);
              setIsHidingBtn(false);
            }, 400);
            if (navigator.vibrate) navigator.vibrate(30);
          }
          return;
        }

        // Pull UP am Ende: Button erscheinen
        if (deltaY < -TOUCH_THRESHOLD && !currentShowBtn && atBottom) {
          setShowPersonalizeBtn(true);
          setIsHidingBtn(false);
          isPulling = false;
          if (navigator.vibrate) navigator.vibrate(50);
          
          // FIX 1: Auto-Scroll nach Animation (400ms)
          setTimeout(() => {
            if (contentRef.current) {
              contentRef.current.scrollTo({ 
                top: contentRef.current.scrollHeight, 
                behavior: 'smooth' 
              });
            }
            const btn = document.querySelector('.personalize-btn-revealed') as HTMLElement;
            btn?.focus();
          }, 400);
        }
      };

      const handleTouchEnd = () => {
        isPulling = false;
      };

      // WHEEL EVENTS - passive: false für preventDefault()
      const handleWheel = (e: WheelEvent) => {
        const atBottom = isAtBottom();
        const currentShowBtn = showPersonalizeBtnRef.current;
        
        // FIX 2a: Button sichtbar UND Upscroll → preventDefault()
        if (currentShowBtn && e.deltaY < 0) {
          e.preventDefault(); // Blockiere Browser-Scroll!
          accumulatedDeltaRef.current += e.deltaY;
          
          if (accumulatedDeltaRef.current < -WHEEL_THRESHOLD) {
            setIsHidingBtn(true);
            accumulatedDeltaRef.current = 0;
            setTimeout(() => {
              setShowPersonalizeBtn(false);
              setIsHidingBtn(false);
            }, 400);
          }
          return;
        }
        
        // Normal: Akkumuliere nur wenn am Ende ODER Button sichtbar
        if (!atBottom && !currentShowBtn) {
          accumulatedDeltaRef.current = 0;
          return;
        }

        accumulatedDeltaRef.current += e.deltaY;
        resetInactivityTimeout();

        // Scroll down am Ende: Button erscheinen
        if (accumulatedDeltaRef.current > WHEEL_THRESHOLD && !currentShowBtn && atBottom) {
          setShowPersonalizeBtn(true);
          setIsHidingBtn(false);
          accumulatedDeltaRef.current = 0;
          
          // FIX 1: Auto-Scroll nach Animation (400ms)
          setTimeout(() => {
            if (contentRef.current) {
              contentRef.current.scrollTo({ 
                top: contentRef.current.scrollHeight, 
                behavior: 'smooth' 
              });
            }
            const btn = document.querySelector('.personalize-btn-revealed') as HTMLElement;
            btn?.focus();
          }, 400);
        }
      };

      // Event Listeners mit passive: false!
      container.addEventListener('touchstart', handleTouchStart, { passive: false });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
      container.addEventListener('wheel', handleWheel, { passive: false });

      containerCleanup = () => {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
        container.removeEventListener('wheel', handleWheel);
      };
    }, 100);

    return () => {
      clearTimeout(initTimeout);
      containerCleanup?.();
    };
  }, []);

  async function loadTemplates() {
    const allTemplates = await db.templates.orderBy('order').toArray();
    setTemplates(allTemplates);
  }

  async function handleCreateTemplate() {
    const name = prompt('Name der neuen Vorlage:');
    if (!name) return;
    
    // Prüfe ob Name bereits existiert
    const nameExists = templates.some(t => t.name.toLowerCase() === name.toLowerCase());
    if (nameExists) {
      alert(`⚠️ Eine Vorlage mit dem Namen "${name}" existiert bereits!\n\nBitte wähle einen anderen Namen.`);
      return;
    }
    
    try {
      await createTemplate(name, []);
      await loadTemplates();
      onNavigate('editor');
    } catch (error) {
      console.error('Fehler beim Erstellen:', error);
      alert('Fehler beim Erstellen der Vorlage');
    }
  }

  function handleBlockChange(blockId: string, value: BlockValue) {
    setCurrentBlocks(prev => 
      prev.map(block => 
        block.id === blockId ? { ...block, value } : block
      )
    );
  }

  function handleDashboardConfigChange(blockId: string, config: { eventCategory: 'event' | 'doctor'; eventTitle: string }) {
    console.log('[handleDashboardConfigChange] Called with:', { blockId, config });
    setCurrentBlocks(prev => {
      const updated = prev.map(block => {
        if (block.id === blockId) {
          const updatedBlock = {
            ...block,
            dashboard: {
              ...block.dashboard,
              enabled: block.dashboard?.enabled || false,
              eventCategory: config.eventCategory,
              eventTitle: config.eventTitle
            }
          };
          console.log('[handleDashboardConfigChange] Updated block:', updatedBlock);
          return updatedBlock;
        }
        return block;
      });
      console.log('[handleDashboardConfigChange] New currentBlocks:', updated);
      return updated;
    });
  }

  function handlePresetSaved() {
    // Reset DiaryView nach Preset-Speichern
    setFormKey(prev => prev + 1);
    setCurrentBlocks(JSON.parse(JSON.stringify(templates[activeTabIndex].blocks)));
    setOriginalBlocks(JSON.parse(JSON.stringify(templates[activeTabIndex].blocks)));
    setHasUnsavedChanges(false);
    
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleBlockConfigChange(blockId: string, config: { defaultPresetId?: string }) {
    setCurrentBlocks(prev => 
      prev.map(block => 
        block.id === blockId 
          ? { 
              ...block, 
              bodyMapConfig: { 
                ...block.bodyMapConfig, 
                ...config 
              } 
            }
          : block
      )
    );
  }

  function handleTemplateChange(newIndex: number) {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        '⚠️ Du hast ungespeicherte Änderungen!\n\nMöchtest du wirklich die Vorlage wechseln? Alle Änderungen gehen verloren.'
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
        '⚠️ Du hast ungespeicherte Änderungen!\n\nMöchtest du zum Vorlagen-Editor wechseln? Alle Änderungen gehen verloren.'
      );
      if (!confirmed) return;
    }

    if (onEditTemplate) {
      onEditTemplate(currentTemplate.id);
    } else {
      onNavigate('editor');
    }
  }

  function triggerPersonalizeReveal() {
    const container = contentRef.current;
    if (!container) return;

    // Phase 1: nach ganz oben scrollen damit der Scroll nach unten sichtbar ist
    container.scrollTo({ top: 0, behavior: 'smooth' });

    setTimeout(() => {
      // Phase 2: Button einblenden BEVOR wir scrollen
      // → scrollHeight enthält dann bereits die Button-Höhe
      setShowPersonalizeBtn(true);
      setIsHidingBtn(false);

      // Phase 3: Einen Frame warten damit React den Button gerendert hat,
      // dann animierten Scroll nach unten starten
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const maxScroll = container.scrollHeight - container.clientHeight;
          const duration = 1200;
          const start = performance.now();
          const startScroll = container.scrollTop;

          function easeInOut(t: number) {
            return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          }

          function animStep(now: number) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            container.scrollTop = startScroll + (maxScroll - startScroll) * easeInOut(progress);
            if (progress < 1) requestAnimationFrame(animStep);
          }

          requestAnimationFrame(animStep);
        });
      });
    }, 600); // kurze Pause damit scroll-to-top abgeschlossen ist
  }

  async function handleSave() {
    if (!templates[activeTabIndex]?.id) return;
    
    console.log('[handleSave] Starting save with currentBlocks:', currentBlocks);
    
    setIsSaving(true);
    try {
      const mode = await getEncryptionMode();
      
      const blocksToSave = currentBlocks.filter(block => {
        // Event-Config vorhanden? → IMMER speichern (auch wenn value leer)
        if (block.dashboard?.eventTitle) return true;
        
        // Sonst: Nur speichern wenn value nicht leer
        if (block.value === undefined || block.value === null) return false;
        if (typeof block.value === 'string' && block.value.trim() === '') return false;
        if (Array.isArray(block.value) && block.value.length === 0) return false;
        return true;
      });
      
      console.log('[handleSave] Filtered blocksToSave:', blocksToSave);
      console.log('[handleSave] blocksToSave as JSON:', JSON.stringify(blocksToSave, null, 2));
      
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
      
      const entryToSave = {
        templateId: templates[activeTabIndex].id!,
        timestamp: new Date(),
        encrypted,
        data,
        tags
      };
      
      console.log('[handleSave] Saving to DB:', entryToSave);
      console.log('[handleSave] Data content:', data);
      
      await db.entries.add(entryToSave);
      
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
            <Menu size={22} />
          </button>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center">
            <p className="text-lg font-semibold mb-2">Keine Vorlagen vorhanden</p>
            <p className="text-sm text-muted-foreground mb-4">
              Erstelle deine erste Vorlage, um loszulegen.
            </p>
            <Button onClick={handleCreateTemplate} className="gap-2">
              <Plus size={22} />
              Neue Vorlage erstellen
            </Button>
          </Card>
        </div>

        {showMenu && (
          <>
            <div className="fixed inset-0 bg-black/30 z-20" onClick={() => setShowMenu(false)} />
            <Card className="fixed top-16 right-4 z-40 p-2 shadow-xl min-w-[240px] border-2">
              <div className="space-y-1">
                <Button onClick={() => { setShowMenu(false); onNavigate('editor'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                  <Paintbrush size={22} /><span className="font-medium">Seite personalisieren</span>
                </Button>
                <Button onClick={() => { setShowMenu(false); onNavigate('history'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                  <History size={22} /><span className="font-medium">Verlauf anzeigen</span>
                </Button>
                <Button onClick={() => { setShowMenu(false); onNavigate('dashboard'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                  <TrendingUp size={22} /><span className="font-medium">Dashboard</span>
                </Button>
                <Button onClick={() => { setShowMenu(false); onNavigate('settings'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                  <Settings size={22} /><span className="font-medium">Einstellungen</span>
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
          <Menu size={22} />
        </button>
        
        {(hasUnsavedChanges || forceTutorialSaveBtn) && (
          <button
            className="floating-btn-glass save-btn floating-btn-enter animate-pulse-glow-green"
            onClick={hasUnsavedChanges ? handleSave : undefined}
            disabled={isSaving || (!hasUnsavedChanges && forceTutorialSaveBtn)}
          >
            <Check size={22} />
          </button>
        )}
      </div>

      <div className="fixed top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <button className="floating-btn-glass" onClick={() => onBack?.()}>
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-base font-semibold">{activeTemplate?.name || 'Tagebuch'}</h1>
          <div className="w-10" />
        </div>
      </div>

      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto pb-20 px-5 pt-16"
        style={{ 
          scrollBehavior: 'smooth',
          touchAction: 'manipulation'
        }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="space-y-3 diary-content" key={formKey}>
            {currentBlocks.map(block => (
              <BlockRenderer
                key={block.id}
                block={block}
                onChange={(value) => handleBlockChange(block.id, value)}
                onDashboardConfigChange={handleDashboardConfigChange}
                onPresetSaved={handlePresetSaved}
                onConfigChange={(config) => handleBlockConfigChange(block.id, config)}
                hideLabel={block.hideLabelInDiary}
              />
            ))}
          </div>

          {showPersonalizeBtn && (
            <div className={cn("mt-8 pt-6 border-t border-gray-200", isHidingBtn ? "animate-slide-down" : "animate-slide-up")}>
              <button
                onClick={handlePersonalize}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 personalize-btn-revealed animate-pulse-glow"
                tabIndex={0}
              >
                <Paintbrush size={22} style={{ color: '#6366f1' }} />
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
                <IconComponent size={22} />
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tutorial - DiaryView */}
      <PageTutorial
        page="diary"
        steps={[
          {
            // Step 0: Bottombar
            spotlight: '.bottom-nav-glass',
            title: 'Vorlagen-Navigation',
            text: 'Tausche schnell zwischen deinen verschiedenen Vorlagen hin und her.',
            cardPosition: 'between',
            betweenSelectors: ['.diary-content', '.bottom-nav-glass'],
          },
          {
            // Step 1: Content (Header ausschließen, 56px = h-14)
            spotlight: '.diary-content',
            spotlightExcludeTop: 56,
            title: 'Tagebucheintrag',
            text: 'Hier kannst du deinen Tagebucheintrag vornehmen.',
            cardPosition: 'auto',
          },
          {
            // Step 2: Save-Button (Karte obere Hälfte)
            spotlight: '.floating-buttons-container',
            title: 'Speichern',
            text: 'Sobald du etwas eingetragen hast, erscheint ein Speichern-Button.',
            cardPosition: 'top',
          },
          {
            // Step 3: Menü-Button, Karte wie Step 2 (top)
            spotlight: '.floating-buttons-container',
            title: 'Vorlage personalisieren',
            text: 'Um diese Vorlage zu personalisieren, nutze das Menü oben.',
            cardPosition: 'top',
          },
          {
            // Step 4: Viewport-Mitte bis unten, 300ms delay, dann Scroll-Animation
            // Karte wie Step 2 (top)
            spotlight: null,
            spotlightFullBottom: true,
            title: 'Oder scrolle nach unten',
            text: '... oder scrolle ganz nach unten und drücke auf den Button.',
            cardPosition: 'top',
            extraDelay: 300,
          },
        ]}
        onStepChange={(index) => {
          // Step 2: Save-Button erzwingen
          if (index === 2) {
            setForceTutorialSaveBtn(true);
          } else {
            setForceTutorialSaveBtn(false);
          }
          // Step 4: Scroll-Animation triggern
          if (index === 4) {
            triggerPersonalizeReveal();
          }
          // Fertig/Dismiss: aufräumen
          if (index === -1) {
            setForceTutorialSaveBtn(false);
          }
        }}
      />

      {showMenu && (
        <>
          <div className="fixed inset-0 bg-black/30 z-20" onClick={() => setShowMenu(false)} />
          <Card className="fixed top-16 right-4 z-40 p-2 shadow-xl min-w-[240px] border-2">
            <div className="space-y-1">
              <Button onClick={() => { setShowMenu(false); handlePersonalize(); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                <Paintbrush size={22} /><span className="font-medium">Seite personalisieren</span>
              </Button>
              <Button onClick={() => { setShowMenu(false); onNavigate('history'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                <History size={22} /><span className="font-medium">Verlauf anzeigen</span>
              </Button>
              <Button onClick={() => { setShowMenu(false); onNavigate('dashboard'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                <TrendingUp size={22} /><span className="font-medium">Dashboard</span>
              </Button>
              <Button onClick={() => { setShowMenu(false); onNavigate('settings'); }} variant="ghost" className="w-full justify-start gap-3 h-11">
                <Settings size={22} /><span className="font-medium">Einstellungen</span>
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
