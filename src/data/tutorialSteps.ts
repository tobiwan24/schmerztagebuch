import type { TutorialPage } from '../contexts/TutorialContext';

export type TutorialStepType = 'spotlight' | 'banner';

export interface SpotlightStep {
  step: string;
  type: 'spotlight';
  targetSelector: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  content: {
    title: string;
    description: string;
    tip?: string;
  };
}

export interface BannerStep {
  step: string;
  type: 'banner';
  content: string;
}

export type TutorialStep = SpotlightStep | BannerStep;

export const TUTORIAL_STEPS: Record<TutorialPage, TutorialStep[]> = {
  home: [
    {
      step: 'select-template',
      type: 'spotlight',
      targetSelector: '.template-card',
      position: 'bottom',
      content: {
        title: 'Vorlage auswählen',
        description: 'Tippe auf eine Vorlage, um mit dem Tagebuch zu beginnen.',
      },
    },
    {
      step: 'add-template-hint',
      type: 'banner',
      content: '💡 Tipp: Neue Vorlage erstellen mit dem + Button unten rechts.',
    },
  ],
  diary: [
    {
      step: 'fill-entry',
      type: 'spotlight',
      targetSelector: '.diary-content',
      position: 'top',
      content: {
        title: 'Eintrag ausfüllen',
        description: 'Fülle die Felder aus und speichere deinen Eintrag oben rechts.',
        tip: 'Alle Felder sind optional.',
      },
    },
    {
      step: 'pull-to-reveal',
      type: 'banner',
      content: '💡 Tipp: Nach unten ziehen zeigt Vorlagen-Anpassungen.',
    },
    {
      step: 'save-reminder',
      type: 'banner',
      content: '💡 Vergiss nicht zu speichern! Tippe auf das ✓ oben rechts.',
    },
  ],
  editor: [
    {
      step: 'add-block',
      type: 'spotlight',
      targetSelector: '.block-palette',
      position: 'top',
      content: {
        title: 'Blöcke hinzufügen',
        description: 'Wähle Eingabeblöcke aus der Palette, um deine Vorlage aufzubauen.',
      },
    },
    {
      step: 'reorder-blocks',
      type: 'banner',
      content: '💡 Tipp: Blöcke per Drag & Drop neu anordnen.',
    },
    {
      step: 'template-name',
      type: 'spotlight',
      targetSelector: '.template-name-input',
      position: 'bottom',
      content: {
        title: 'Vorlage benennen',
        description: 'Gib deiner Vorlage einen aussagekräftigen Namen.',
      },
    },
    {
      step: 'save-template',
      type: 'banner',
      content: '💡 Vorlage oben rechts speichern, wenn du fertig bist.',
    },
  ],
  dashboard: [
    {
      step: 'chart-overview',
      type: 'spotlight',
      targetSelector: '.dashboard-chart',
      position: 'bottom',
      content: {
        title: 'Dein Verlauf',
        description: 'Hier siehst du deine Schmerzdaten als Diagramm über die Zeit.',
      },
    },
    {
      step: 'time-range',
      type: 'banner',
      content: '💡 Tipp: Zeitraum oben anpassen, um verschiedene Perioden zu vergleichen.',
    },
  ],
  history: [
    {
      step: 'browse-entries',
      type: 'spotlight',
      targetSelector: '.history-list',
      position: 'top',
      content: {
        title: 'Deine Einträge',
        description: 'Alle vergangenen Tagebucheinträge findest du hier – filterbar und exportierbar.',
      },
    },
  ],
  settings: [
    {
      step: 'backup-hint',
      type: 'banner',
      content: '💡 Tipp: Regelmäßige Backups schützen deine Daten vor Datenverlust.',
    },
  ],
};
