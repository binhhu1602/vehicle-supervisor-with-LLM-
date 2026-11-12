import { CONGESTION_LEVELS, INCIDENT_TYPES, SEVERITY } from '../../domain/constants.js';

/**
 * Ngữ cảnh thời gian thực gửi kèm câu hỏi cho LLM (grounding).
 * Gọn nhẹ, chỉ chứa dữ liệu cần thiết → giảm token và tránh lộ thông tin thừa.
 */
export function buildLlmContext({ cameras, openIncidents, kpis }) {
  return {
    generatedAt: new Date().toISOString(),
    kpis,
    cameras: cameras.map((c) => ({
      id: c.id,
      name: c.name,
      district: c.district,
      online: c.metric?.online ?? false,
      flow: c.metric?.flow ?? 0,
      avgSpeed: c.metric?.avgSpeed ?? 0,
      occupancy: c.metric?.occupancy ?? 0,
      level: c.metric?.level ?? 0,
      levelLabel: CONGESTION_LEVELS[c.metric?.level ?? 0].label,
    })),
    openIncidents: openIncidents.slice(0, 20).map((i) => ({
      id: i.id,
      type: i.type,
      typeLabel: INCIDENT_TYPES[i.type]?.label,
      severity: i.severity,
      severityLabel: SEVERITY[i.severity]?.label,
      status: i.status,
      cameraId: i.cameraId,
      cameraName: i.cameraName,
      createdAt: i.createdAt,
      description: i.description,
    })),
  };
}

/** System prompt dùng ở backend (tham khảo) — để frontend và backend thống nhất hành vi trợ lý. */
export const SYSTEM_PROMPT = `Bạn là trợ lý điều hành giao thông của trung tâm giám sát.
- Chỉ trả lời dựa trên dữ liệu thời gian thực được cung cấp trong ngữ cảnh.
- Nếu dữ liệu không đủ, nói rõ là không đủ dữ liệu, không bịa số liệu.
- Ưu tiên an toàn: sự cố mức Khẩn cấp/Cao phải được nêu trước.
- Trả lời ngắn gọn bằng tiếng Việt, dùng gạch đầu dòng, kèm đề xuất hành động cụ thể.`;
