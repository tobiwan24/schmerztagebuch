import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTutorial, type TutorialPage } from '../../contexts/TutorialContext';

// ─── Typen ───────────────────────────────────────────────────────────────────

export interface TutorialStep {
  /** CSS-Selector des Spotlight-Elements. null = kein Spotlight, alles dunkel */
  spotlight: string | null;
  /** Titel in der Karte (optional) */
  title?: string;
  /** Beschreibungstext */
  text: string;
  /**
   * Wo die Karte erscheinen soll:
   * 'auto'   = automatisch (Seite mit mehr Platz)
   * 'top'    = immer oben im Viewport
   * 'bottom' = immer unten im Viewport
   * 'center' = vertikal mittig (nur sinnvoll ohne Spotlight)
   */
  cardPosition?: 'auto' | 'top' | 'bottom' | 'center';
}

interface PageTutorialProps {
  page: TutorialPage;
  steps: TutorialStep[];
}

// ─── Spotlight-Stil berechnen ────────────────────────────────────────────────

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function computeSpotlight(selector: string, padding = 8): SpotlightRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - padding,
    left: r.left - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
  };
}

/** Liefert die vertikale Kartenposition für einen Step */
function resolveCardPlacement(
  step: TutorialStep,
  spotlight: SpotlightRect | null,
): 'top' | 'bottom' | 'center' {
  if (step.cardPosition === 'center') return 'center';
  if (step.cardPosition === 'top') return 'top';
  if (step.cardPosition === 'bottom') return 'bottom';

  // 'auto' oder undefined
  if (!spotlight) return 'center';

  const spaceBelow = window.innerHeight - (spotlight.top + spotlight.height);
  const spaceAbove = spotlight.top;
  const CARD_MIN = 180;

  if (spaceBelow >= CARD_MIN || spaceBelow >= spaceAbove) return 'bottom';
  return 'top';
}

// ─── Komponente ──────────────────────────────────────────────────────────────

export default function PageTutorial({ page, steps }: PageTutorialProps) {
  const { isPageTutorialDone, markPageTutorialDone, dismissPage, dismissGlobally } =
    useTutorial();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [cardPlacement, setCardPlacement] = useState<'top' | 'bottom' | 'center'>('center');
  const [visible, setVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const done = isPageTutorialDone(page);

  // ── Spotlight positionieren ──────────────────────────────────────────────
  const positionStep = useCallback(
    (index: number) => {
      const step = steps[index];
      if (!step) return;

      setVisible(false);
      setShowMenu(false);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (step.spotlight) {
        const el = document.querySelector(step.spotlight);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      timeoutRef.current = setTimeout(() => {
        const sp = step.spotlight ? computeSpotlight(step.spotlight) : null;
        setSpotlight(sp);
        setCardPlacement(resolveCardPlacement(step, sp));
        setVisible(true);
      }, 350);
    },
    [steps],
  );

  useEffect(() => {
    if (done || steps.length === 0) return;
    positionStep(0);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // Bewusst nur beim Mount / wenn done sich ändert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (done || steps.length === 0) return null;

  const step = steps[currentIndex];
  const isLast = currentIndex === steps.length - 1;

  // ── Handler ──────────────────────────────────────────────────────────────
  function handleNext() {
    if (isLast) {
      setVisible(false);
      setTimeout(() => markPageTutorialDone(page), 200);
    } else {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      positionStep(next);
    }
  }

  function handleDismissPage() {
    setVisible(false);
    setShowMenu(false);
    setTimeout(() => dismissPage(page), 200);
  }

  function handleDismissGlobally() {
    setVisible(false);
    setShowMenu(false);
    setTimeout(() => dismissGlobally(), 200);
  }

  // ── Card-Position-Stil ───────────────────────────────────────────────────
  const cardPositionStyle: React.CSSProperties =
    cardPlacement === 'center'
      ? { top: '50%', transform: 'translateX(-50%) translateY(-50%)' }
      : cardPlacement === 'bottom'
      ? { bottom: '4vh', transform: 'translateX(-50%)' }
      : { top: '4vh', transform: 'translateX(-50%)' };

  // ── Spotlight-Stil ───────────────────────────────────────────────────────
  const spotlightStyle: React.CSSProperties | null = spotlight
    ? {
        position: 'fixed',
        top: spotlight.top,
        left: spotlight.left,
        width: spotlight.width,
        height: spotlight.height,
        borderRadius: 12,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
        zIndex: 9998,
        pointerEvents: 'none',
        transition: 'top 300ms ease, left 300ms ease, width 300ms ease, height 300ms ease',
      }
    : null;

  // Wenn kein Spotlight: ganzen Hintergrund abdunkeln
  const backdropStyle: React.CSSProperties = spotlight
    ? { position: 'fixed', inset: 0, zIndex: 9997 }
    : { position: 'fixed', inset: 0, zIndex: 9997, background: 'rgba(0,0,0,0.65)' };

  return (
    <>
      {/* Hintergrund / Abdunklung */}
      <div style={backdropStyle} onClick={() => setShowMenu(false)} />

      {/* Spotlight-Loch */}
      {spotlightStyle && (
        <div style={spotlightStyle} className="tutorial-spotlight" />
      )}

      {/* Karte */}
      <div
        className="tutorial-card-wrapper"
        style={{
          position: 'fixed',
          left: '50%',
          zIndex: 9999,
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms ease-in-out',
          ...cardPositionStyle,
        }}
      >
        <div className="tutorial-card">
          {/* Header */}
          <div className="tutorial-card-header">
            <span className="tutorial-card-title">
              {step.title ?? ''}
            </span>

            {/* Fortschrittsanzeige */}
            {steps.length > 1 && (
              <span className="tutorial-step-counter">
                {currentIndex + 1} / {steps.length}
              </span>
            )}

            {/* Menü */}
            <div style={{ position: 'relative' }}>
              <button
                className="tutorial-menu-btn"
                onClick={(e) => { e.stopPropagation(); setShowMenu(p => !p); }}
                aria-label="Mehr Optionen"
              >
                <ChevronDown size={14} />
              </button>

              {showMenu && (
                <div className="tutorial-dropdown" onClick={e => e.stopPropagation()}>
                  <button className="tutorial-dropdown-item" onClick={handleDismissPage}>
                    Auf dieser Seite nicht mehr
                  </button>
                  <button className="tutorial-dropdown-item" onClick={handleDismissGlobally}>
                    Überall nicht mehr
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Text */}
          <p className="tutorial-card-desc">{step.text}</p>

          {/* Button */}
          <button className="tutorial-confirm-btn" onClick={handleNext}>
            {isLast ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      </div>
    </>
  );
}
