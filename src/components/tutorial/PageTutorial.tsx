import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTutorial, type TutorialPage } from '../../contexts/useTutorial';
import styles from './PageTutorial.module.css';

// ─── Typen ───────────────────────────────────────────────────────────────────

export interface TutorialStep {
  /** CSS-Selector des Spotlight-Elements. null = kein Spotlight, alles dunkel */
  spotlight: string | null;
  /**
   * Schneidet das Spotlight oben ab (z.B. um einen fixierten Header auszuschließen).
   * Wert in px – das Spotlight beginnt erst unterhalb dieser Höhe.
   */
  spotlightExcludeTop?: number;
  /**
   * Wenn true: Spotlight-Loch reicht von Viewport-Mitte bis ganz unten.
   * Ignoriert spotlight-Selector für die Loch-Geometrie.
   */
  spotlightFullBottom?: boolean;
  /**
   * Zwei Selektoren: Spotlight springt im Wechsel zwischen beiden hin und her.
   * Überschreibt spotlight wenn gesetzt.
   */
  spotlightToggle?: [string, string];
  /** Titel in der Karte (optional) */
  title?: string;
  /** Beschreibungstext */
  text: string;
  /**
   * Wo die Karte erscheinen soll:
   * 'auto'    = automatisch (Seite mit mehr Platz, kollisionsfrei)
   * 'top'     = bevorzugt oben im Viewport
   * 'bottom'  = bevorzugt unten im Viewport
   * 'center'  = vertikal mittig im Viewport
   * 'between' = mittig zwischen zwei DOM-Elementen (braucht betweenSelectors)
   */
  cardPosition?: 'auto' | 'top' | 'bottom' | 'center' | 'between';
  /**
   * Nur für cardPosition 'between':
   * [0] = oberes Element (Unterkante = Obergrenze des Gaps)
   * [1] = unteres Element (Oberkante = Untergrenze des Gaps)
   */
  betweenSelectors?: [string, string];
  /** Zusätzlicher Delay in ms bevor der Step sichtbar wird (nach Standard-350ms) */
  extraDelay?: number;
}

interface PageTutorialProps {
  page: TutorialPage;
  steps: TutorialStep[];
  /** Wird bei jedem Step-Wechsel aufgerufen. index === -1 bei Fertig/Dismiss */
  onStepChange?: (index: number) => void;
}

// ─── Spotlight-Geometrie ─────────────────────────────────────────────────────

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function computeSpotlight(
  selector: string,
  padding = 8,
  excludeTop?: number,
): SpotlightRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const rawTop = r.top - padding;
  const clampedTop = excludeTop !== undefined ? Math.max(rawTop, excludeTop) : rawTop;
  const heightReduction = clampedTop - rawTop;
  return {
    top: clampedTop,
    left: r.left - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2 - heightReduction,
  };
}

function computeSpotlightFullBottom(): SpotlightRect {
  const midY = window.innerHeight / 2;
  return {
    top: midY,
    left: 0,
    width: window.innerWidth,
    height: window.innerHeight - midY,
  };
}

// ─── Kartenplatzierung ───────────────────────────────────────────────────────

const CARD_HEIGHT_EST = 200;
const CARD_MARGIN = 16;

function resolveCardPlacement(
  step: TutorialStep,
  spotlight: SpotlightRect | null,
): 'top' | 'bottom' | 'center' {
  if (step.cardPosition === 'center') return 'center';
  if (step.cardPosition === 'top') return 'top';
  if (step.cardPosition === 'bottom') return 'bottom';

  if (!spotlight) return 'center';

  const spotlightBottom = spotlight.top + spotlight.height;
  const spaceAbove = spotlight.top;
  const spaceBelow = window.innerHeight - spotlightBottom;

  const preferred: 'top' | 'bottom' = spaceBelow >= spaceAbove ? 'bottom' : 'top';
  const preferredSpace = preferred === 'top' ? spaceAbove : spaceBelow;
  const otherSide: 'top' | 'bottom' = preferred === 'top' ? 'bottom' : 'top';
  const otherSpace = preferred === 'top' ? spaceBelow : spaceAbove;

  if (preferredSpace >= CARD_HEIGHT_EST + CARD_MARGIN) return preferred;
  if (otherSpace >= CARD_HEIGHT_EST + CARD_MARGIN) return otherSide;
  return preferred;
}

// ─── Komponente ──────────────────────────────────────────────────────────────

export default function PageTutorial({ page, steps, onStepChange }: PageTutorialProps) {
  const { isPageTutorialDone, markPageTutorialDone, dismissPage, dismissGlobally } =
    useTutorial();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [cardPlacement, setCardPlacement] = useState<'top' | 'bottom' | 'center' | 'between'>('center');
  const [cardBetweenTopPx, setCardBetweenTopPx] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toggleIndexRef = useRef(0);
  const done = isPageTutorialDone(page);

  // Toggle-Interval aufräumen
  function clearToggleInterval() {
    if (toggleIntervalRef.current) {
      clearInterval(toggleIntervalRef.current);
      toggleIntervalRef.current = null;
    }
  }

  // ── Step positionieren ───────────────────────────────────────────────────
  const positionStep = useCallback(
    (index: number) => {
      const step = steps[index];
      if (!step) return;

      setVisible(false);
      setShowMenu(false);
      onStepChange?.(index);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      clearToggleInterval();
      toggleIndexRef.current = 0;

      if (step.spotlight && !step.spotlightFullBottom) {
        const el = document.querySelector(step.spotlight);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      const totalDelay = 350 + (step.extraDelay ?? 0);

      timeoutRef.current = setTimeout(() => {
        // spotlightToggle: Spotlight wechselt per Interval zwischen zwei Selektoren
        if (step.spotlightToggle) {
          const [selA, selB] = step.spotlightToggle;
          const selectors = [selA, selB];

          // Kartenposition anhand des ersten Elements berechnen
          const firstSp = computeSpotlight(selA, 8);
          setCardBetweenTopPx(null);
          setCardPlacement(resolveCardPlacement(step, firstSp));

          // Sofort ersten Selector anzeigen
          setSpotlight(computeSpotlight(selectors[0], 8));
          setVisible(true);

          // Dann im Wechsel
          toggleIntervalRef.current = setInterval(() => {
            toggleIndexRef.current = (toggleIndexRef.current + 1) % 2;
            setSpotlight(computeSpotlight(selectors[toggleIndexRef.current], 8));
          }, 700);

          return;
        }

        // Normales einzelnes Spotlight
        const sp = step.spotlightFullBottom
          ? computeSpotlightFullBottom()
          : step.spotlight
          ? computeSpotlight(step.spotlight, 8, step.spotlightExcludeTop)
          : null;

        setSpotlight(sp);

        if (step.cardPosition === 'between' && step.betweenSelectors) {
          const [topSel, botSel] = step.betweenSelectors;
          const topEl = document.querySelector(topSel);
          const botEl = document.querySelector(botSel);
          if (topEl && botEl) {
            const topBottom = topEl.getBoundingClientRect().bottom;
            const botTop = botEl.getBoundingClientRect().top;
            const gapHeight = botTop - topBottom;
            if (gapHeight >= CARD_HEIGHT_EST) {
              setCardBetweenTopPx(topBottom + gapHeight / 2);
              setCardPlacement('between');
            } else {
              setCardBetweenTopPx(null);
              setCardPlacement(resolveCardPlacement(step, sp));
            }
          } else {
            setCardBetweenTopPx(null);
            setCardPlacement(resolveCardPlacement(step, sp));
          }
        } else {
          setCardBetweenTopPx(null);
          setCardPlacement(resolveCardPlacement(step, sp));
        }

        setVisible(true);
      }, totalDelay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps],
  );

  useEffect(() => {
    if (done || steps.length === 0) return;
    positionStep(0);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      clearToggleInterval();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (done || steps.length === 0) return null;

  const step = steps[currentIndex];
  const isLast = currentIndex === steps.length - 1;

  // ── Handler ──────────────────────────────────────────────────────────────
  function handleNext() {
    if (isLast) {
      onStepChange?.(-1);
      setVisible(false);
      clearToggleInterval();
      setTimeout(() => markPageTutorialDone(page), 200);
    } else {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      positionStep(next);
    }
  }

  function handleDismissPage() {
    onStepChange?.(-1);
    setVisible(false);
    setShowMenu(false);
    clearToggleInterval();
    setTimeout(() => dismissPage(page), 200);
  }

  function handleDismissGlobally() {
    onStepChange?.(-1);
    setVisible(false);
    setShowMenu(false);
    clearToggleInterval();
    setTimeout(() => dismissGlobally(), 200);
  }

  // ── Karten-Position-Stil ─────────────────────────────────────────────────
  const cardPositionStyle: React.CSSProperties =
    cardPlacement === 'between' && cardBetweenTopPx !== null
      ? { top: cardBetweenTopPx, transform: 'translateX(-50%) translateY(-50%)' }
      : cardPlacement === 'center'
      ? { top: '50%', transform: 'translateX(-50%) translateY(-50%)' }
      : cardPlacement === 'bottom'
      ? { bottom: 'max(4vh, 72px)', transform: 'translateX(-50%)' }
      : { top: 'max(4vh, 72px)', transform: 'translateX(-50%)' };

  // ── Spotlight-Stil ───────────────────────────────────────────────────────
  const spotlightStyle: React.CSSProperties | null = spotlight
    ? {
        position: 'fixed',
        top: spotlight.top,
        left: spotlight.left,
        width: spotlight.width,
        height: spotlight.height,
        borderRadius: step.spotlightFullBottom ? 0 : 12,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
        zIndex: 9998,
        pointerEvents: 'none',
        transition: 'top 300ms ease, left 300ms ease, width 300ms ease, height 300ms ease',
      }
    : null;

  const backdropStyle: React.CSSProperties = spotlight
    ? { position: 'fixed', inset: 0, zIndex: 9997 }
    : { position: 'fixed', inset: 0, zIndex: 9997, background: 'rgba(0,0,0,0.65)' };

  return (
    <>
      <div style={backdropStyle} onClick={() => setShowMenu(false)} />

      {spotlightStyle && (
        <div style={spotlightStyle} className={styles.tutorialSpotlight} />
      )}

      <div
        className={styles.tutorialCardWrapper}
        style={{
          position: 'fixed',
          left: '50%',
          zIndex: 9999,
          opacity: visible ? 1 : 0,
          transition: 'opacity 200ms ease-in-out',
          ...cardPositionStyle,
        }}
      >
        <div className={styles.tutorialCard}>
          <div className={styles.tutorialCardHeader}>
            <span className={styles.tutorialCardTitle}>{step.title ?? ''}</span>

            {steps.length > 1 && (
              <span className={styles.tutorialStepCounter}>
                {currentIndex + 1} / {steps.length}
              </span>
            )}

            <div style={{ position: 'relative' }}>
              <button
                className={styles.tutorialMenuBtn}
                onClick={(e) => { e.stopPropagation(); setShowMenu(p => !p); }}
                aria-label="Mehr Optionen"
              >
                <ChevronDown size={14} />
              </button>

              {showMenu && (
                <div className={styles.tutorialDropdown} onClick={e => e.stopPropagation()}>
                  <button className={styles.tutorialDropdownItem} onClick={handleDismissPage}>
                    Auf dieser Seite nicht mehr
                  </button>
                  <button className={styles.tutorialDropdownItem} onClick={handleDismissGlobally}>
                    Überall nicht mehr
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className={styles.tutorialCardDesc}>{step.text}</p>

          <button className={styles.tutorialConfirmBtn} onClick={handleNext}>
            {isLast ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      </div>
    </>
  );
}
