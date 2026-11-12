// Vorläufige App-Hülle (M7, Teilaufgabe 1). Routing und Ansichten folgen in Teilaufgabe 2.
import { de } from './i18n/de';

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">{de.app.name}</h1>
      <p className="text-muted-foreground">{de.app.loading}</p>
    </main>
  );
}
