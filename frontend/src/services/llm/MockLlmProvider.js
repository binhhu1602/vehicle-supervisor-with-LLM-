import { analyzeIncident, analyzeTraffic, answerQuestion, summaryAnswer } from './mockResponder.js';

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const abortError = () => new DOMException('Đã hủy', 'AbortError');
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true },
    );
  });

/**
 * Provider LLM giả lập — mô phỏng độ trễ và trả lời dạng streaming (từng đoạn chữ)
 * giống API LLM thật, để UI được phát triển và kiểm thử trước khi có backend.
 */
export class MockLlmProvider {
  name = 'Mock LLM (giả lập)';

  async *chat({ messages, context, signal }) {
    const question = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const answer = answerQuestion(question, context);
    await sleep(450, signal);
    const tokens = answer.match(/\S+\s*|\n/g) ?? [];
    for (const tok of tokens) {
      await sleep(14 + Math.random() * 22, signal);
      yield tok;
    }
  }

  async analyzeIncident({ incident, context, signal }) {
    await sleep(700 + Math.random() * 500, signal);
    return analyzeIncident(incident, context);
  }

  /** camera + lịch sử số liệu gần nhất của camera (từ store phía client). */
  async analyzeTraffic({ camera, history, signal }) {
    await sleep(800, signal);
    return analyzeTraffic(camera, history);
  }

  async summarize({ context, signal }) {
    await sleep(600, signal);
    return summaryAnswer(context);
  }
}
