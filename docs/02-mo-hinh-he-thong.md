# 02 · Mô hình hóa hệ thống

> Áp dụng **Chương 5 – Mô hình hóa hệ thống**: mô hình ngữ cảnh, tương tác (use case, sequence), cấu trúc (class) và hành vi (state). Sơ đồ viết bằng Mermaid — xem trực tiếp trên GitHub/VS Code.

## 1. Mô hình ngữ cảnh (Context model)

```mermaid
flowchart LR
  CAM[Camera giao thông] -->|Video RTSP| VISION[AI Vision<br/>nhận diện phương tiện]
  VISION -->|số liệu, sự cố| BE[(Backend Node.js<br/>+ CSDL)]
  BE <-->|WebSocket + REST| FE[Frontend TrafficEye<br/>React]
  BE <-->|API| LLM[Dịch vụ LLM]
  FE --- U1((Điều hành viên))
  FE --- U2((Quản trị viên))
  FE --- U3((Người xem))
  style FE fill:#0ea5e9,color:#fff
```

Phạm vi giai đoạn này: **Frontend** (khối tô màu). Backend, AI Vision và LLM được thay bằng **bộ giả lập** có cùng giao diện để phát triển song song.

## 2. Use case

```mermaid
flowchart LR
  OP((Điều hành viên))
  AD((Quản trị viên))
  VW((Người xem))
  subgraph TrafficEye
    UC1([Đăng nhập])
    UC2([Theo dõi tổng quan])
    UC3([Xem bản đồ / camera])
    UC4([Xử lý sự cố])
    UC5([Hỏi trợ lý AI])
    UC6([Xem phân tích AI của sự cố])
    UC7([Xem & xuất báo cáo])
    UC8([Cấu hình ngưỡng])
  end
  VW --> UC1 & UC2 & UC3 & UC5 & UC7
  OP --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7
  AD --> UC8
  AD -.kế thừa.-> OP
  UC4 -.include.-> UC6
```

## 3. Sequence – luồng dữ liệu thời gian thực (Observer)

```mermaid
sequenceDiagram
  participant S as RealtimeSource<br/>(Mock / WebSocket)
  participant P as TrafficProvider<br/>(Controller)
  participant R as trafficReducer<br/>(Model)
  participant V as Các View<br/>(Dashboard, Map…)
  P->>S: on(event, handler) × 5
  P->>S: connect()
  S-->>P: connection:status = connected
  S-->>P: traffic:snapshot {cameras, metricsHistory, incidents}
  P->>R: dispatch(SNAPSHOT)
  R-->>V: state mới → render
  loop mỗi 2 giây
    S-->>P: metrics:update [8 camera]
    P->>R: dispatch(METRICS)
    R-->>V: KPI, biểu đồ, bản đồ cập nhật
  end
  S-->>P: incident:new
  P->>R: dispatch(INCIDENT_NEW)
  P-->>V: Toast thông báo (useIncidentNotifications)
```

## 4. Sequence – xử lý sự cố

```mermaid
sequenceDiagram
  actor OP as Điều hành viên
  participant D as IncidentDetail
  participant SM as incidentStateMachine
  participant P as TrafficProvider
  participant S as Backend / Mock
  OP->>D: Bấm "Tiếp nhận"
  D->>SM: availableActions(status) (để hiển thị nút hợp lệ)
  D->>P: transitionIncident(id, "acknowledge", actor, note)
  P->>S: send {type: incident:transition}
  S->>SM: applyTransition() — kiểm tra hợp lệ
  S-->>P: incident:update (có timeline mới)
  P-->>D: re-render trạng thái + lịch sử
```

Backend là **nguồn sự thật**: frontend gửi lệnh, chỉ cập nhật khi nhận sự kiện `incident:update` → mọi điều hành viên thấy cùng một trạng thái.

## 5. Sequence – hỏi trợ lý AI (streaming)

```mermaid
sequenceDiagram
  actor U as Người dùng
  participant A as AssistantPage
  participant C as useLlmContext
  participant L as LLM Provider<br/>(Mock / Http)
  participant B as Backend /api/llm/chat
  participant M as Mô hình LLM
  U->>A: "Chỗ nào đang ùn tắc?"
  A->>C: lấy ngữ cảnh thời gian thực (KPI, camera, sự cố)
  A->>L: chat({messages ≤12 lượt, context, signal})
  L->>B: POST (SSE)
  B->>M: system prompt + context + câu hỏi
  loop từng token
    M-->>B: delta
    B-->>L: data: {"delta": "..."}
    L-->>A: yield chunk → hiển thị dần
  end
  U-->>A: (tùy chọn) bấm Dừng → AbortController.abort()
```

## 6. Class diagram (tầng frontend)

```mermaid
classDiagram
  class EventEmitter {
    -listeners: Map
    +on(event, handler) unsubscribe
    +off(event, handler)
    +emit(event, payload)
  }
  class RealtimeSource {
    <<interface>>
    +connect()
    +disconnect()
    +send(command)
  }
  class MockRealtimeSource
  class WebSocketRealtimeSource {
    -attempt: number
    -queue: string[]
  }
  class TrafficSimulator {
    +tick(at) metrics, incidents
    +warmup(n)
    +setThresholds(t)
  }
  class LlmProvider {
    <<interface>>
    +chat(messages, context, signal) AsyncIterable~string~
    +analyzeIncident(incident, context) Analysis
    +summarize(context) string
  }
  class MockLlmProvider
  class HttpLlmProvider
  class Incident {
    id; type; severity; status
    cameraId; createdAt; timeline[]
  }
  EventEmitter <|-- MockRealtimeSource
  EventEmitter <|-- WebSocketRealtimeSource
  RealtimeSource <|.. MockRealtimeSource
  RealtimeSource <|.. WebSocketRealtimeSource
  MockRealtimeSource --> TrafficSimulator
  LlmProvider <|.. MockLlmProvider
  LlmProvider <|.. HttpLlmProvider
  TrafficSimulator ..> Incident : tạo
```

## 7. State diagram – vòng đời Sự cố

```mermaid
stateDiagram-v2
  [*] --> NEW: AI phát hiện
  NEW --> ACKNOWLEDGED: acknowledge
  ACKNOWLEDGED --> IN_PROGRESS: start
  IN_PROGRESS --> RESOLVED: resolve
  NEW --> FALSE_ALARM: falseAlarm
  ACKNOWLEDGED --> FALSE_ALARM: falseAlarm
  IN_PROGRESS --> FALSE_ALARM: falseAlarm
  RESOLVED --> NEW: reopen
  FALSE_ALARM --> NEW: reopen
```

Cài đặt chính xác sơ đồ này tại `frontend/src/domain/incidentStateMachine.js`, kiểm thử tại `domain/__tests__/domain.test.js`.
