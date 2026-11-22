// Schritte des Onboardings (Spec 10). Rein, damit die Übergänge ohne Render testbar sind.
export type Step = 'install' | 'mode' | 'factor' | 'cloud' | 'cloud-login' | 'cloud-recovery' | 'backup' | 'diary' | 'location' | 'template';
export const SETUP_STEPS: readonly Step[] = ['diary', 'location', 'template'];

/**
 * Übergang in die Einrichtung (erstes Tagebuch), nachdem das Konto entsperrt ist. Die Ansicht springt beim Entsperren
 * schon selbst auf „Tagebuch“; ein späteres `setStep('diary')` aus dem asynchronen Abschluss darf einen bereits
 * weitergeschalteten Schritt (Ort, Vorlage) nicht zurücksetzen.
 */
export const enterSetup = (current: Step): Step => (SETUP_STEPS.includes(current) ? current : 'diary');
