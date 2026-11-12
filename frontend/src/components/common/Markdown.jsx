import { Fragment } from 'react';

/**
 * Trình hiển thị Markdown tối giản cho câu trả lời của LLM.
 * Tạo phần tử React thay vì innerHTML → an toàn trước XSS từ nội dung do mô hình sinh ra.
 * Hỗ trợ: "### tiêu đề", "- gạch đầu dòng", **in đậm**, dòng trống.
 */
function inline(text, keyPrefix) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
    ),
  );
}

export function Markdown({ text = '' }) {
  const blocks = [];
  let list = null;
  text.split('\n').forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      if (!list) {
        list = [];
        blocks.push({ type: 'ul', items: list, key: idx });
      }
      list.push({ key: idx, text: trimmed.slice(2) });
      return;
    }
    list = null;
    if (!trimmed) return;
    if (trimmed.startsWith('### ')) blocks.push({ type: 'h', text: trimmed.slice(4), key: idx });
    else blocks.push({ type: 'p', text: trimmed, key: idx });
  });

  return (
    <div className="md">
      {blocks.map((b) => {
        if (b.type === 'ul')
          return (
            <ul key={b.key}>
              {b.items.map((it) => (
                <li key={it.key}>{inline(it.text, it.key)}</li>
              ))}
            </ul>
          );
        if (b.type === 'h') return <h4 key={b.key}>{inline(b.text, b.key)}</h4>;
        return <p key={b.key}>{inline(b.text, b.key)}</p>;
      })}
    </div>
  );
}
