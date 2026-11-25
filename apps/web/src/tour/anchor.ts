// Hervorhebung des Tour-Ziels (A-082): Elemente mit `data-tour="…"` bekommen diese Klassen; die Tour-Karte setzt
// `data-tour-active` am aktuellen Ziel. Als Konstante, damit Tailwind die Klassen im Quelltext findet.
export const TOUR_RING =
  'data-[tour-active]:rounded-lg data-[tour-active]:ring-2 data-[tour-active]:ring-primary data-[tour-active]:ring-offset-2 data-[tour-active]:ring-offset-background';
