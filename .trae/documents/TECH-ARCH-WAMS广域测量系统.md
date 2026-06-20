## 1. Architecture Design

```mermaid
graph TB
    subgraph "数据采集层"
        A1["PMU设备1"]
        A2["PMU设备2"]
        AN["PMU设备N"]
    end
    
    subgraph "C++ 附加组件"
        B1["UDP组播侦听器"]
        B2["IEEE C37.118解码器"]
        B3["数据校验模块"]
    end
    
    subgraph "Node.js 后端服务"
        C1["Addon 桥接层"]
        C2["Redis 流写入器"]
        C3["WebSocket 服务"]
        C4["配置管理"]
        C5["告警引擎"]
    end
    
    subgraph "数据存储层"
        D1["Redis 内存流"]
        D2["Redis 哈希存储"]
    end
    
    subgraph "React 前端应用"
        E1["WebSocket 客户端"]
        E2["数据状态管理"]
        E3["相量图组件"]
        E4["频率波浪线组件"]
        E5["节点状态面板"]
        E6["告警信息栏"]
    end
    
    A1 & A2 & AN -->|"UDP组播 50fps"| B1
    B1 --> B2
    B2 --> B3
    B3 --> C1
    C1 --> C2
    C2 --> D1 & D2
    D1 --> C3
    C1 --> C5
    C3 --> E1
    E1 --> E2
    E2 --> E3 & E4 & E5 & E6
```

## 2. Technology Description

### 2.1 后端技术栈
- **运行时**：Node.js 18+ (LTS)
- **C++ 附加组件**：Node-API (N-API) v8，避免 V8 引擎版本依赖问题
- **网络通信**：原生 UDP Socket (C++)、WebSocket (ws 库)
- **数据存储**：Redis 7.0+，使用 Redis Streams 实现高速数据流
- **Web 框架**：Express 4.x，提供 RESTful API
- **构建工具**：CMake + node-gyp，用于编译 C++ 插件

### 2.2 前端技术栈
- **框架**：React 18 + TypeScript 5
- **构建工具**：Vite 5
- **样式方案**：TailwindCSS 3 + CSS Variables 主题系统
- **状态管理**：Zustand（轻量级，适合高频数据场景）
- **可视化**：Canvas 2D API + 自定义 requestAnimationFrame 渲染循环
- **WebSocket**：原生 WebSocket API + 自动重连机制

### 2.3 关键技术选型理由
1. **Node-API**：相比传统 NAN，提供稳定 ABI，编译后可跨 Node.js 版本使用
2. **Redis Streams**：相比 Pub/Sub，支持数据持久化、消费者组、消息追溯，适合高频时序数据
3. **Zustand**：相比 Redux，减少样板代码，支持状态分片更新，避免高频数据导致的全量重渲染
4. **Canvas 2D**：相比 SVG/D3，在 50Hz 高频渲染场景下性能更优，支持像素级控制

## 3. Route Definitions

| Route | Purpose |
|-------|---------|
| `/` | 态势感知大屏主页面 |
| `/dashboard` | 态势感知大屏（别名） |
| `/replay` | 历史数据回放页面 |
| `/config` | 系统配置页面 |
| `/api/stations` | 获取厂站列表 REST API |
| `/api/stations/:id` | 厂站 CRUD REST API |
| `/api/config/protocol` | 协议配置 REST API |
| `/ws/realtime` | WebSocket 实时数据推送端点 |

## 4. API Definitions (if backend exists)

### 4.1 TypeScript 类型定义

```typescript
// PMU 相量数据结构
interface PhasorData {
  stationId: string;
  timestamp: number;
  frequency: number;
  freqDeviation: number;
  phasors: Phasor[];
  analogs: number[];
  digitals: boolean[];
  dataQuality: number;
}

// 单相相量数据
interface Phasor {
  name: string;
  magnitude: number;
  angle: number;
  type: 'voltage' | 'current';
}

// 厂站配置
interface StationConfig {
  id: string;
  name: string;
  pmuId: number;
  ipAddress: string;
  port: number;
  phasorCount: number;
  analogCount: number;
  digitalCount: number;
  nominalVoltage: number;
  status: 'online' | 'offline' | 'error';
}

// 告警信息
interface AlarmMessage {
  id: string;
  timestamp: number;
  stationId: string;
  type: 'frequency' | 'voltage' | 'angle' | 'communication';
  level: 'info' | 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

// WebSocket 消息
interface WsMessage<T = any> {
  type: 'data' | 'alarm' | 'status' | 'config';
  payload: T;
  timestamp: number;
}
```

### 4.2 REST API 规范

**GET /api/stations**
```typescript
// Response
{
  code: 0,
  message: 'success',
  data: StationConfig[]
}
```

**POST /api/stations**
```typescript
// Request Body
Omit<StationConfig, 'id' | 'status'>

// Response
{
  code: 0,
  message: 'success',
  data: StationConfig
}
```

**PUT /api/stations/:id**
```typescript
// Request Body
Partial<StationConfig>

// Response
{
  code: 0,
  message: 'success',
  data: StationConfig
}
```

**DELETE /api/stations/:id**
```typescript
// Response
{
  code: 0,
  message: 'success'
}
```

## 5. Server Architecture Diagram (if backend exists)

```mermaid
graph TD
    subgraph "Node.js 进程"
        subgraph "C++ 线程池 (libuv)"
            UDPServer["UDP 组播服务器\n（独立线程）"]
            Decoder["C37.118 解码器\n（线程池）"]
        end
        
        subgraph "主线程"
            NAPI["Node-API 桥接层"]
            RedisWriter["Redis 流写入器"]
            WSServer["WebSocket 服务"]
            Express["Express API 服务"]
            AlarmEngine["告警引擎"]
            ConfigManager["配置管理器"]
        end
    end
    
    subgraph "外部依赖"
        Redis["Redis 服务器"]
        Browser["浏览器客户端"]
    end
    
    UDPServer -->|"原始报文"| Decoder
    Decoder -->|"解码数据"| NAPI
    NAPI -->|"JS 对象"| RedisWriter
    NAPI -->|"JS 对象"| AlarmEngine
    RedisWriter -->|"XADD"| Redis
    Redis -->|"XREAD"| WSServer
    WSServer -->|"WebSocket"| Browser
    AlarmEngine -->|"告警"| WSServer
    ConfigManager <--> Express
    Express <--> Browser
```

## 6. Data Model (if applicable)

### 6.1 Data Model Definition

```mermaid
erDiagram
    STATION {
        string id PK
        string name
        int pmu_id
        string ip_address
        int port
        int phasor_count
        int analog_count
        int digital_count
        float nominal_voltage
        string status
        datetime created_at
        datetime updated_at
    }
    
    PHASOR_CONFIG {
        string id PK
        string station_id FK
        string name
        string type
        int index
        float nominal_value
    }
    
    ALARM_RULE {
        string id PK
        string station_id FK
        string metric
        string operator
        float threshold
        string level
        bool enabled
    }
    
    STATION ||--o{ PHASOR_CONFIG : has
    STATION ||--o{ ALARM_RULE : has
```

### 6.2 Redis 数据结构设计

**Redis Stream - 实时数据流**
```
Key: wams:stream:phasors
Entry: {
  stationId: string,
  timestamp: number,
  frequency: float,
  freqDeviation: float,
  phasor_0_mag: float,
  phasor_0_ang: float,
  ...
  dataQuality: int
}
Maxlen: ~100000 （约30分钟数据，50fps）
```

**Redis Hash - 厂站最新状态**
```
Key: wams:station:{stationId}:latest
Fields: {
  timestamp: number,
  frequency: float,
  freqDeviation: float,
  phasors: JSON string,
  status: string,
  dataQuality: int
}
```

**Redis Hash - 配置存储**
```
Key: wams:config:stations
Field: stationId
Value: JSON string of StationConfig
```

**Redis Set - 在线厂站**
```
Key: wams:stations:online
Members: stationId
TTL: 5秒（心跳超时自动移除）
```

### 6.3 系统配置文件

```json
{
  "server": {
    "port": 3001,
    "websocketPort": 3002
  },
  "udp": {
    "multicastAddress": "239.255.0.1",
    "port": 4712,
    "interface": "0.0.0.0"
  },
  "redis": {
    "host": "127.0.0.1",
    "port": 6379,
    "db": 0
  },
  "protocol": {
    "version": "2011",
    "timeBase": 1000000,
    "maxFrameSize": 65535
  },
  "alarm": {
    "frequencyHigh": 50.5,
    "frequencyLow": 49.5,
    "angleDiffMax": 30,
    "voltageHigh": 1.1,
    "voltageLow": 0.9
  }
}
```
