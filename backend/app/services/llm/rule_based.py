"""Bộ trả lời DỰ PHÒNG theo luật (không gọi mô hình ngôn ngữ).

Dùng khi chưa cấu hình khóa API hoặc khi dịch vụ LLM lỗi → hệ thống vẫn trả lời được, dựa
đúng trên dữ liệu thời gian thực (tính sẵn sàng – NFR). Logic tương đương bản giả lập ở frontend.
"""

import re
import unicodedata
from datetime import datetime

from app.domain.constants import CONGESTION_LABEL, SEVERITY_RANK

INTENTS = ("INCIDENTS", "CONGESTION", "CAMERA_DETAIL", "CAMERA_STATUS", "RECOMMEND", "SUMMARY", "GREETING", "UNKNOWN")


def normalize_vi(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower()).replace("đ", "d")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", text).strip()


def _any(text: str, keys: list[str]) -> bool:
    return any(k in text for k in keys)


def find_camera(question: str, cameras: list[dict]) -> dict | None:
    q = normalize_vi(question)
    m = re.search(r"cam-?0?(\d{1,2})", q)
    if m:
        cid = f"CAM-{int(m.group(1)):02d}"
        found = next((c for c in cameras if c["id"] == cid), None)
        if found:
            return found
    best, best_score = None, 0
    for c in cameras:
        parts = [p.strip() for p in re.split(r"[–-]", normalize_vi(c["name"])) if p.strip()]
        score = sum(len(p) for p in parts if p in q)
        if score > best_score:
            best, best_score = c, score
    return best if best_score >= 6 else None


def detect_intent(question: str, cameras: list[dict]) -> str:
    q = normalize_vi(question)
    if find_camera(question, cameras):
        return "CAMERA_DETAIL"
    if _any(q, ["su co", "tai nan", "va cham", "canh bao", "nguoc chieu", "den do"]):
        return "INCIDENTS"
    if _any(q, ["de xuat", "giai phap", "khuyen nghi", "nen lam", "phan luong", "xu ly the nao"]):
        return "RECOMMEND"
    if _any(q, ["un tac", "tac duong", "ket xe", "un u", "diem nong", "dong xe", "cham"]):
        return "CONGESTION"
    if _any(q, ["camera", "mat tin hieu", "offline", "thiet bi"]):
        return "CAMERA_STATUS"
    if _any(q, ["tom tat", "tong hop", "bao cao", "tinh hinh", "tong quan", "hien tai"]):
        return "SUMMARY"
    if _any(q, ["xin chao", "chao", "hello"]):
        return "GREETING"
    return "UNKNOWN"


def _hhmm(ms_or_iso) -> str:
    dt = datetime.fromisoformat(ms_or_iso) if isinstance(ms_or_iso, str) else datetime.fromtimestamp(ms_or_iso / 1000)
    return dt.astimezone().strftime("%H:%M")


def _by_congestion(c: dict):
    return (-c["level"], c["avgSpeed"])


def _incidents(ctx: dict) -> str:
    items = sorted(ctx["openIncidents"], key=lambda i: -SEVERITY_RANK.get(i["severity"], 0))
    if not items:
        return "Hiện **không có sự cố nào đang mở** trên toàn mạng lưới."
    lines = [f"### Sự cố đang mở: {len(items)}"]
    lines += [
        f"- **[{i['severityLabel']}] {i['typeLabel']}** tại {i['cameraName']} ({_hhmm(i['createdAt'])}) — {i['id']}, trạng thái: {i['status']}"
        for i in items[:6]
    ]
    if len(items) > 6:
        lines.append(f"- … và {len(items) - 6} sự cố khác.")
    critical = [i for i in items if i["severity"] in ("HIGH", "CRITICAL")]
    lines.append("")
    lines.append(
        f"Có **{len(critical)}** sự cố mức Cao/Khẩn cấp. Đề nghị ưu tiên điều lực lượng tới **{critical[0]['cameraName']}** trước."
        if critical
        else "Các sự cố hiện tại ở mức thấp – trung bình, có thể xử lý theo thứ tự tiếp nhận."
    )
    return "\n".join(lines)


def _congestion(ctx: dict) -> str:
    online = [c for c in ctx["cameras"] if c["online"]]
    hot = sorted([c for c in online if c["level"] >= 2], key=_by_congestion)
    if not hot:
        busiest = max(online, key=lambda c: c["flow"], default=None)
        extra = f"\n- Nút có lưu lượng cao nhất: **{busiest['name']}** ({busiest['flow']} xe/phút, {busiest['avgSpeed']} km/h)." if busiest else ""
        return "Hiện **không có điểm ùn tắc** đáng kể." + extra
    lines = [f"### Điểm nóng ùn tắc ({len(hot)} nút)"]
    lines += [
        f"- **{c['name']}** ({c['district']}): {c['levelLabel']}, tốc độ TB **{c['avgSpeed']} km/h**, {c['flow']} xe/phút, chiếm dụng {round(c['occupancy'] * 100)}%"
        for c in hot
    ]
    lines += ["", f"Chỉ số ùn tắc toàn mạng: **{ctx['kpis']['congestionIndex']}/100**."]
    return "\n".join(lines)


def _camera_detail(ctx: dict, cam: dict) -> str:
    c = next((x for x in ctx["cameras"] if x["id"] == cam["id"]), cam)
    if not c["online"]:
        return f"Camera **{c['id']} – {c['name']}** đang **mất tín hiệu**. Không có dữ liệu thời gian thực; đề nghị kiểm tra đường truyền hoặc cử kỹ thuật viên."
    incs = [i for i in ctx["openIncidents"] if i["cameraId"] == c["id"]]
    kind = "nút giao khác mức (vòng xuyến + cầu vượt)" if c.get("layout") == "interchange" else "ngã tư có đèn tín hiệu"
    tip = (
        ("Đề xuất: điều tiết luồng vào vòng xuyến, hướng dẫn xe đi thẳng sử dụng cầu vượt." if c.get("layout") == "interchange"
         else "Đề xuất: kéo dài pha xanh hướng ùn, cảnh báo trên bảng VMS và gợi ý tuyến thay thế.")
        if c["level"] >= 2
        else "Giao thông ổn định, tiếp tục theo dõi."
    )
    inc_text = ", ".join("{} ({})".format(i["typeLabel"], i["severityLabel"]) for i in incs)
    return "\n".join(
        [
            f"### {c['name']} ({c['id']})",
            f"- Loại nút: {kind}",
            f"- Tình trạng: **{c['levelLabel']}**",
            f"- Lưu lượng: **{c['flow']} xe/phút** · Tốc độ TB: **{c['avgSpeed']} km/h** · Chiếm dụng làn: {round(c['occupancy'] * 100)}%",
            f"- Sự cố đang mở: {inc_text}" if incs else "- Không có sự cố đang mở tại nút này.",
            "",
            tip,
        ]
    )


def _camera_status(ctx: dict) -> str:
    off = [c for c in ctx["cameras"] if not c["online"]]
    head = f"### Trạng thái camera: {len(ctx['cameras']) - len(off)}/{len(ctx['cameras'])} trực tuyến"
    body = "\n".join(f"- **{c['id']}** – {c['name']}: mất tín hiệu" for c in off) or "- Tất cả camera hoạt động bình thường."
    return f"{head}\n{body}"


def _recommend(ctx: dict) -> str:
    recs = []
    for a in (i for i in ctx["openIncidents"] if i["type"] == "ACCIDENT"):
        recs.append(f"- **{a['cameraName']}**: điều CSGT và cứu hộ tới hiện trường ({a['id']}); phong tỏa làn bị ảnh hưởng.")
    hot = sorted([c for c in ctx["cameras"] if c["online"] and c["level"] >= 2], key=_by_congestion)
    for c in hot[:3]:
        recs.append(f"- **{c['name']}**: tăng thời gian pha xanh 15–20 giây cho hướng ùn; hiển thị cảnh báo trên bảng VMS.")
    if len(hot) >= 2:
        recs.append("- Phân luồng từ xa: hướng dẫn phương tiện đi tuyến song song để giảm tải các nút trên.")
    off = [c["id"] for c in ctx["cameras"] if not c["online"]]
    if off:
        recs.append(f"- Cử kỹ thuật kiểm tra camera {', '.join(off)}.")
    return "\n".join(["### Đề xuất điều hành", *(recs or ["- Giao thông đang ổn định, chưa cần can thiệp. Tiếp tục giám sát."])])


def summary_answer(ctx: dict) -> str:
    k = ctx["kpis"]
    hot = sorted([c for c in ctx["cameras"] if c["online"] and c["level"] >= 2], key=_by_congestion)
    status = "căng thẳng" if k["congestionIndex"] >= 60 else "đông đúc" if k["congestionIndex"] >= 35 else "ổn định"
    hot_text = ", ".join("**{}**".format(c["name"]) for c in hot[:3])
    return "\n".join(
        [
            f"### Tóm tắt tình hình lúc {_hhmm(ctx['generatedAt'])}",
            f"- Giao thông toàn mạng: **{status}** (chỉ số ùn tắc {k['congestionIndex']}/100)",
            f"- Tổng lưu lượng: **{k['totalFlow']} xe/phút**, tốc độ trung bình **{k['avgSpeed']} km/h**",
            f"- Sự cố đang mở: **{k['openIncidents']}** ({k['criticalIncidents']} mức cao/khẩn cấp)",
            f"- Camera trực tuyến: {k['camerasOnline']}/{k['camerasTotal']}",
            f"- Điểm nóng: {hot_text}" if hot else "- Không có điểm nóng ùn tắc.",
        ]
    )


HELP = "\n".join(
    [
        "Tôi có thể giúp bạn:",
        '- "Tóm tắt tình hình giao thông hiện tại"',
        '- "Những điểm nào đang ùn tắc?"',
        '- "Có sự cố nào nghiêm trọng không?"',
        '- "Tình hình ở Ngã ba Huế thế nào?"',
        '- "Đề xuất phương án điều hành"',
    ]
)


def answer_question(question: str, ctx: dict) -> str:
    intent = detect_intent(question, ctx["cameras"])
    if intent == "INCIDENTS":
        return _incidents(ctx)
    if intent == "CONGESTION":
        return _congestion(ctx)
    if intent == "CAMERA_DETAIL":
        return _camera_detail(ctx, find_camera(question, ctx["cameras"]))
    if intent == "CAMERA_STATUS":
        return _camera_status(ctx)
    if intent == "RECOMMEND":
        return _recommend(ctx)
    if intent == "SUMMARY":
        return summary_answer(ctx)
    if intent == "GREETING":
        return f"Xin chào! Tôi là trợ lý điều hành giao thông.\n{HELP}"
    return f"Tôi chưa hiểu rõ câu hỏi. {HELP}"


_ANALYSIS = {
    "ACCIDENT": (
        "Va chạm giữa phương tiện, có thể do mất tập trung hoặc giữ khoảng cách không an toàn khi lưu lượng cao.",
        "Dự kiến gây ùn ứ 20–40 phút trên hướng bị ảnh hưởng.",
        ["Điều CSGT và xe cứu thương tới hiện trường", "Phong tỏa làn bị ảnh hưởng, đặt biển cảnh báo từ xa 200m", "Phát cảnh báo trên bảng VMS các tuyến lân cận"],
    ),
    "CONGESTION": (
        "Lưu lượng vượt năng lực thông hành của nút giao, chu kỳ đèn hiện tại chưa phù hợp.",
        "Có thể lan rộng sang các nút liền kề nếu kéo dài quá 15 phút.",
        ["Tăng thời gian pha xanh cho hướng ùn 15–20 giây", "Hướng dẫn phân luồng sang tuyến song song", "Theo dõi thêm 10 phút, nếu không cải thiện cử CSGT điều tiết"],
    ),
    "WRONG_WAY": (
        "Phương tiện đi ngược chiều – nguy cơ va chạm trực diện cao.",
        "Rủi ro an toàn cao, ảnh hưởng lưu lượng thấp.",
        ["Thông báo ngay cho tổ CSGT gần nhất", "Trích xuất biển số từ video để xử phạt", "Kiểm tra lại biển báo/vạch kẻ đường tại vị trí"],
    ),
    "RED_LIGHT": (
        "Vi phạm tín hiệu đèn giao thông.",
        "Không ảnh hưởng đáng kể tới lưu lượng.",
        ["Lưu bằng chứng (ảnh, video, biển số) vào hồ sơ vi phạm", "Chuyển dữ liệu cho bộ phận xử lý phạt nguội"],
    ),
    "STALLED_VEHICLE": (
        "Phương tiện dừng bất thường, có thể do hỏng hóc.",
        "Giảm năng lực thông hành 1 làn, ùn ứ cục bộ.",
        ["Liên hệ đơn vị cứu hộ kéo xe", "Cảnh báo làn bị chiếm dụng trên VMS"],
    ),
    "CAMERA_OFFLINE": (
        "Mất kết nối mạng hoặc nguồn điện tại camera.",
        "Mất khả năng giám sát khu vực này.",
        ["Kiểm tra trạng thái switch/nguồn từ xa", "Cử kỹ thuật viên nếu không khôi phục sau 10 phút", "Tạm dùng camera lân cận để giám sát khu vực"],
    ),
}


def analyze_incident(incident: dict, ctx: dict) -> dict:
    cam = next((c for c in ctx["cameras"] if c["id"] == incident["cameraId"]), None)
    level = CONGESTION_LABEL[cam["level"]] if cam else "không rõ"
    cause, impact, actions = _ANALYSIS[incident["type"]]
    risk = {"CRITICAL": "cao", "HIGH": "cao", "MEDIUM": "trung bình"}.get(incident["severity"], "thấp")
    return {
        "summary": f"{incident['description']} Tình trạng hiện tại của nút: {level}. Mức rủi ro đánh giá: {risk}.",
        "probableCause": cause,
        "impact": impact,
        "recommendedActions": actions,
        "confidence": incident["confidence"],
        "model": "rule-based",
    }
