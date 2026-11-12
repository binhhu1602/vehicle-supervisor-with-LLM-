import { httpClient } from '../api/httpClient.js';

/**
 * Provider LLM thật: gọi backend FastAPI. Backend giữ API key của nhà cung cấp LLM
 * (KHÔNG bao giờ để API key ở frontend – yêu cầu bảo mật).
 *
 *   POST {api}/llm/chat              → text/event-stream, mỗi dòng "data: {"delta":"..."}"
 *   POST {api}/llm/analyze-incident  → JSON { summary, probableCause, impact, recommendedActions, confidence, model }
 *   POST {api}/llm/summarize         → JSON { text }
 *   POST {api}/llm/analyze-traffic   → JSON phân tích lưu lượng (số liệu do AI Vision trích xuất, lưu ở PostgreSQL)
 */
export class HttpLlmProvider {
  name = 'LLM qua backend';

  constructor({ baseUrl }) {
    this.baseUrl = baseUrl;
  }

  async *chat({ messages, context, signal }) {
    const res = await httpClient.raw(`${this.baseUrl}/llm/chat`, {
      method: 'POST',
      body: JSON.stringify({ messages, context }),
      headers: { Accept: 'text/event-stream' },
      signal,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const { delta } = JSON.parse(data);
          if (delta) yield delta;
        } catch {
          /* bỏ qua dòng hỏng */
        }
      }
    }
  }

  analyzeIncident({ incident, context, signal }) {
    return httpClient.post(`${this.baseUrl}/llm/analyze-incident`, { incident, context }, { signal });
  }

  analyzeTraffic({ camera, minutes = 60, signal }) {
    return httpClient.post(`${this.baseUrl}/llm/analyze-traffic`, { cameraId: camera?.id ?? null, minutes }, { signal });
  }

  async summarize({ context, signal }) {
    const { text } = await httpClient.post(`${this.baseUrl}/llm/summarize`, { context }, { signal });
    return text;
  }
}
