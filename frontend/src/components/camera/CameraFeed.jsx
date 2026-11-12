import { useEffect, useRef, useState } from 'react';
import { buildScene, H, W } from './scene/scenes.js';
import { TrafficEngine } from './scene/engine.js';
import { config } from '../../config/env.js';
import { getToken } from '../../services/api/httpClient.js';

/**
 * Khung hình camera MÔ PHỎNG (nhìn từ trên cao) theo đúng loại nút giao:
 *  - ngã tư có đèn tín hiệu theo pha, xe xếp hàng chờ đèn đỏ, rẽ trái/phải/đi thẳng;
 *  - Ngã ba Huế: nút giao khác mức (vòng xuyến + cầu vượt + đường dẫn cong).
 * Lưu lượng & tốc độ bám theo số liệu thời gian thực của camera. Kèm khung nhận diện AI.
 * Camera có worker AI Vision (YOLO11 + ByteTrack) đang gửi hình → tự chuyển sang hiển thị hình THẬT (LiveFrame).
 */
function drawNoise(ctx) {
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const val = Math.random() * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, H / 2 - 22, W, 44);
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MẤT TÍN HIỆU', W / 2, H / 2 + 6);
  ctx.textAlign = 'left';
}

function drawHud(ctx, camera, engine, scene, now) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, 20);
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(`${camera.id}  ${camera.name}`, 8, 14);
  ctx.fillText(new Date().toLocaleTimeString('vi-VN'), W - 66, 14);
  ctx.fillStyle = Math.floor(now / 600) % 2 ? '#ef4444' : 'transparent';
  ctx.beginPath();
  ctx.arc(W - 76, 10, 4, 0, Math.PI * 2);
  ctx.fill();

  const c = engine.counts();
  const total = c.motorbike + c.car + c.truck + c.bus;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, H - 20, W, 20);
  ctx.fillStyle = '#a7f3d0';
  ctx.fillText(`AI: ${total} phương tiện · ${c.queued} đang chờ`, 8, H - 6);
  ctx.fillStyle = '#fde68a';
  const st = scene.status();
  ctx.fillText(st, W - 8 - ctx.measureText(st).width, H - 6);
}

function SimulatedFeed({ camera, metric, showBoxes = true, className = '', style }) {
  const canvasRef = useRef(null);
  const metricRef = useRef(metric);
  metricRef.current = metric;
  const boxesRef = useRef(showBoxes);
  boxesRef.current = showBoxes;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined; // môi trường test (jsdom) không có canvas

    const scene = buildScene(cameraRef.current);
    const engine = new TrafficEngine(scene);
    engine.warmup(10, metricRef.current);

    let raf = 0;
    let visible = true;
    let last = performance.now();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;

      const m = metricRef.current;
      if (!m || !m.online) {
        if (Math.random() < 0.3) drawNoise(ctx);
        return;
      }
      engine.step(dt, m);
      scene.drawGround(ctx);
      engine.draw(ctx, 0, boxesRef.current);
      scene.drawSignals?.(ctx);
      if (scene.drawElevated) {
        scene.drawElevated(ctx);
        engine.draw(ctx, 1, boxesRef.current);
      }
      drawHud(ctx, cameraRef.current, engine, scene, now);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [camera.id, camera.layout, camera.lanes]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className={className}
      style={{ width: '100%', aspectRatio: '16 / 9', display: 'block', background: '#111827', borderRadius: 8, ...style }}
      role="img"
      aria-label={`Hình ảnh camera ${camera.name}`}
    />
  );
}

/** Khung hình THẬT từ worker AI Vision (đã vẽ khung YOLO11 + ID ByteTrack), nạp kiểu double-buffer để không nháy. */
function LiveFrame({ camera, className = '', style }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const url = `${config.apiBaseUrl}/cameras/${camera.id}/frame?token=${encodeURIComponent(getToken())}&t=${camera.frameTs}`;
    const img = new Image();
    img.onload = () => setSrc(url);
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [camera.id, camera.frameTs]);

  return (
    <div className={`live-feed ${className}`} style={style}>
      {src ? <img src={src} alt={`Hình ảnh trực tiếp camera ${camera.name}`} /> : <div className="live-feed-wait">Đang tải hình ảnh…</div>}
      <span className="live-badge">
        <i /> TRỰC TIẾP · YOLO11 + ByteTrack
      </span>
    </div>
  );
}

/** Có hình thật gần đây (≤ 10 giây) → hiển thị hình thật; ngược lại dùng khung hình mô phỏng. */
export function CameraFeed(props) {
  const { camera } = props;
  const live = config.dataSource === 'websocket' && camera.frameTs && Date.now() - camera.frameTs < 10_000;
  return live ? <LiveFrame {...props} /> : <SimulatedFeed {...props} />;
}
