// Provider aus der Server-Konfiguration (Spec 08). `off` → kein Provider; die Routen antworten dann 404/`llm_disabled`.
import { AnthropicProvider, OllamaProvider, type LlmProvider } from '@stb/llm';
import type { LlmConfig } from '../config.js';

export function createLlmProvider(cfg: LlmConfig | undefined): LlmProvider | null {
  if (!cfg || cfg.provider === 'off') return null;
  if (cfg.provider === 'ollama') return new OllamaProvider({ baseUrl: cfg.ollamaUrl ?? '', model: cfg.ollamaModel });
  return new AnthropicProvider({ ...(cfg.anthropicApiKey ? { apiKey: cfg.anthropicApiKey } : {}), model: cfg.anthropicModel });
}
