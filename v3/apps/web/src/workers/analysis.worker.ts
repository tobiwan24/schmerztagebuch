// Web Worker der Analyse (Spec 06): Arbeitsset + Suchindex außerhalb des UI-Threads.
import { attachAnalysisService } from './analysis-service';

attachAnalysisService(self as unknown as Parameters<typeof attachAnalysisService>[0]);
