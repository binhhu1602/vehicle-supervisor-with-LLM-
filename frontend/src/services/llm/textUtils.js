/** Chuẩn hóa tiếng Việt để so khớp từ khóa: bỏ dấu, chữ thường. */
export function normalizeVi(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

export function includesAny(text, keywords) {
  return keywords.some((k) => text.includes(k));
}
