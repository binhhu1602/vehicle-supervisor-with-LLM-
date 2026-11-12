import { createContext, useContext } from 'react';
import { createLlmService } from '../services/llm/index.js';
import { config } from '../config/env.js';

/** LLM service dùng chung toàn ứng dụng (có thể tiêm provider giả trong test). */
export const LlmContext = createContext(createLlmService(config));
export const useLlm = () => useContext(LlmContext);
