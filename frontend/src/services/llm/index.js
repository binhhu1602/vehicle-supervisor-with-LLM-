import { MockLlmProvider } from './MockLlmProvider.js';
import { HttpLlmProvider } from './HttpLlmProvider.js';

/**
 * Giao diện chung của mọi LLM provider (Strategy pattern):
 *   chat({ messages, context, signal })            → AsyncIterable<string>  (streaming)
 *   analyzeIncident({ incident, context, signal }) → Promise<Analysis>
 *   summarize({ context, signal })                 → Promise<string>
 */
export function createLlmService(config) {
  if (config.llmProvider === 'http') return new HttpLlmProvider({ baseUrl: config.apiBaseUrl });
  return new MockLlmProvider();
}
