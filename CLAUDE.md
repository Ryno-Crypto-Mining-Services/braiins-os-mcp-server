# CLAUDE.md: Braiins OS MCP Server Development Instructions
**Project:** braiins-os-mcp-server | **Version:** 1.0.0 | **Updated:** December 2025

---

## 📖 Project Overview

**braiins-os-mcp-server** is a Model Context Protocol (MCP) server that enables AI agents (Claude, Copilot) to safely interact with Braiins OS ASIC miners for Bitcoin mining operations management.

### What This Project Does

Provides a bridge between AI agents and Braiins OS miners through:
- **MCP Tools**: AI-callable functions for miner management (status, firmware updates, configuration)
- **MCP Resources**: Structured data access (fleet metrics, miner status, logs)
- **MCP Prompts**: Guided workflows for common mining operations
- **gRPC Client**: Communication layer to Braiins OS miners
- **REST API**: HTTP endpoints for web/mobile clients
- **Redis Cache**: Performance optimization for fleet operations

### Technology Stack

- **Runtime:** Node.js 20.x LTS
- **Language:** TypeScript (strict mode)
- **MCP SDK:** @modelcontextprotocol/sdk
- **gRPC:** @grpc/grpc-js
- **Cache:** Redis 7.x
- **Testing:** Jest + Supertest
- **Build:** TypeScript compiler + esbuild

---

## 🎯 Core Development Principles

### 1. Agent-First Design

Design every feature from the AI agent's perspective:

**✅ Good MCP Tool Design:**
```typescript
// Consolidates workflow: check status + update firmware + track job
@tool({
  name: "update_miner_firmware",
  description: "Update firmware on one or more miners with progress tracking"
})
async updateMinerFirmware(params: {
  minerIds: string[];    // Support batch operations
  version: string;
  force?: boolean;
}): Promise<JobStatus> {
  // Returns job ID + initial status
  // Agent can poll with check_job_status tool
}
```

**❌ Bad MCP Tool Design:**
```typescript
// Too granular - forces agent to orchestrate low-level steps
@tool({ name: "check_miner_status" })
async checkStatus(minerId: string) { /* ... */ }

@tool({ name: "download_firmware" })
async downloadFirmware(url: string) { /* ... */ }

@tool({ name: "flash_firmware" })
async flashFirmware(minerId: string, path: string) { /* ... */ }
// Agent must call 3+ tools for one logical operation
```

### 2. Context-Optimized Responses

Agents have limited context - make every token count:

**Response Formats:**
- **Concise Mode** (default): High-signal information only
- **Detailed Mode** (optional): Comprehensive data for debugging

**Example:**
```typescript
// Concise: 150 tokens
{
  minerId: "miner-123",
  status: "running",
  hashrate: "95 TH/s",
  temp: "65°C",
  issues: []
}

// Detailed: 500+ tokens
{
  minerId: "miner-123",
  status: "running",
  statusDetails: { /* ... */ },
  hashrate: { current: "95 TH/s", average24h: "93 TH/s", peak: "98 TH/s" },
  temperature: { current: 65, average: 63, limit: 85, sensors: [/* ... */] },
  pools: [/* ... */],
  fans: [/* ... */],
  // ... extensive details
}
```

### 3. Error Messages as Agent Guidance

Errors should guide agents toward solutions:

**✅ Actionable Error:**
```typescript
throw new MCPError({
  code: "MINER_UNREACHABLE",
  message: "Cannot connect to miner miner-123 at 192.168.1.100:50051",
  details: {
    suggestion: "Try 'list_miners' to see all reachable miners, or use 'ping_miner' to test connectivity",
    possibleCauses: ["Miner offline", "Network firewall", "Incorrect IP address"]
  }
});
```

**❌ Cryptic Error:**
```typescript
throw new Error("ECONNREFUSED");
// Agent doesn't know what to do next
```

---

## 🏗️ MCP Server Development Patterns

### Tool Development Workflow

**1. Design Phase**
```typescript
/**
 * @tool update_pool_config
 * @description Update mining pool configuration for one or more miners
 *
 * Design decisions:
 * - Batch operation support (multiple minerIds)
 * - Validation before applying changes
 * - Atomic rollback if any miner fails
 * - Progress tracking for long operations
 */
```

**2. Implementation Phase**
```typescript
import { z } from "zod";
import { tool } from "@modelcontextprotocol/sdk";

// Input validation with Zod
const UpdatePoolConfigSchema = z.object({
  minerIds: z.array(z.string()).min(1).max(100),
  poolUrl: z.string().url(),
  username: z.string().min(1),
  password: z.string().optional(),
  priority: z.number().int().min(0).max(10).default(0)
}).strict();

@tool({
  name: "update_pool_config",
  description: "Update mining pool configuration for one or more miners",
  inputSchema: UpdatePoolConfigSchema,
  annotations: {
    readOnlyHint: false,        // Modifies state
    destructiveHint: false,     // Can be undone
    idempotentHint: true,       // Same result if called multiple times
    openWorldHint: true         // Interacts with external miners
  }
})
async updatePoolConfig(params: z.infer<typeof UpdatePoolConfigSchema>) {
  // 1. Validate miners exist
  const miners = await this.getMinersByIds(params.minerIds);

  // 2. Apply changes atomically
  const results = await Promise.allSettled(
    miners.map(m => this.grpcClient.updatePool(m, params))
  );

  // 3. Return concise status
  return {
    success: results.filter(r => r.status === "fulfilled").length,
    failed: results.filter(r => r.status === "rejected").length,
    details: params.detailLevel === "verbose" ? results : undefined
  };
}
```

**3. Testing Phase**
```typescript
describe("update_pool_config tool", () => {
  it("should update pool for single miner", async () => {
    const result = await mcpServer.callTool("update_pool_config", {
      minerIds: ["miner-1"],
      poolUrl: "stratum+tcp://pool.example.com:3333",
      username: "user.worker1"
    });

    expect(result.success).toBe(1);
  });

  it("should handle partial failures gracefully", async () => {
    // miner-1 reachable, miner-2 offline
    const result = await mcpServer.callTool("update_pool_config", {
      minerIds: ["miner-1", "miner-2"],
      poolUrl: "stratum+tcp://pool.example.com:3333",
      username: "user.worker1"
    });

    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
  });
});
```

### Resource Development Workflow

Resources provide structured data that agents can read:

```typescript
import { resource } from "@modelcontextprotocol/sdk";

@resource({
  uri: "braiins://fleet/summary",
  name: "Fleet Summary",
  description: "Aggregated metrics for all managed miners",
  mimeType: "application/json"
})
async getFleetSummary(): Promise<FleetSummary> {
  // Cache for 30 seconds (fleet data changes slowly)
  const cached = await this.redis.get("fleet:summary");
  if (cached) return JSON.parse(cached);

  const summary = {
    totalMiners: await this.countMiners(),
    onlineMiners: await this.countMinersOnline(),
    totalHashrate: await this.aggregateHashrate(),
    averageTemp: await this.averageTemperature(),
    activeAlerts: await this.getActiveAlerts()
  };

  await this.redis.setex("fleet:summary", 30, JSON.stringify(summary));
  return summary;
}
```

### Prompt Template Development

Prompts guide agents through complex workflows:

```typescript
import { prompt } from "@modelcontextprotocol/sdk";

@prompt({
  name: "troubleshoot_miner_offline",
  description: "Guided troubleshooting for offline miners",
  arguments: [
    { name: "minerId", description: "Miner ID to troubleshoot", required: true }
  ]
})
async troubleshootMinerOffline(minerId: string): Promise<PromptMessage[]> {
  const miner = await this.getMiner(minerId);

  return [
    {
      role: "user",
      content: {
        type: "text",
        text: `Miner ${minerId} is offline. Help me diagnose the issue.`
      }
    },
    {
      role: "assistant",
      content: {
        type: "text",
        text: `I'll help troubleshoot miner ${minerId}. Let me check a few things:

1. Checking last known status...
   Last seen: ${miner.lastSeen}
   Last status: ${miner.lastStatus}

2. Testing network connectivity...
   Use tool: ping_miner({ minerId: "${minerId}" })

3. Checking miner logs...
   Use resource: braiins://miner/${minerId}/logs

Based on the results, I can suggest:
- Reboot miner (if ping succeeds)
- Check network/firewall (if ping fails)
- Review logs for hardware issues
- Check power supply

What would you like to try first?`
      }
    }
  ];
}
```

---

## 🔌 gRPC Client Patterns

### Connection Management

**Pattern: Connection Pooling**
```typescript
// src/api/grpc/pool.ts
export class GrpcConnectionPool {
  private connections: Map<string, MinerServiceClient> = new Map();
  private readonly maxConnections = 100;

  async getConnection(minerId: string): Promise<MinerServiceClient> {
    if (!this.connections.has(minerId)) {
      if (this.connections.size >= this.maxConnections) {
        this.evictOldest();
      }

      const miner = await this.getMinerConfig(minerId);
      const client = new MinerServiceClient(
        `${miner.host}:${miner.port}`,
        grpc.credentials.createInsecure(), // Or TLS credentials
        {
          "grpc.keepalive_time_ms": 30000,
          "grpc.keepalive_timeout_ms": 10000
        }
      );

      this.connections.set(minerId, client);
    }

    return this.connections.get(minerId)!;
  }
}
```

### Retry Logic

**Pattern: Exponential Backoff**
```typescript
// src/api/grpc/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = Math.min(
          initialDelay * Math.pow(backoffFactor, attempt),
          maxDelay
        );
        await sleep(delay);
      }
    }
  }

  throw new MCPError({
    code: "GRPC_RETRY_EXHAUSTED",
    message: `Failed after ${maxRetries} retries`,
    cause: lastError
  });
}
```

### Stream Handling

**Pattern: Real-Time Status Updates**
```typescript
// src/api/grpc/streaming.ts
export class MinerStatusStream {
  async streamMinerStatus(minerId: string): Promise<AsyncIterableIterator<MinerStatus>> {
    const client = await this.pool.getConnection(minerId);

    const stream = client.streamStatus({ minerId });

    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return new Promise((resolve, reject) => {
              stream.on("data", (status: MinerStatus) => {
                resolve({ value: status, done: false });
              });
              stream.on("end", () => {
                resolve({ value: undefined, done: true });
              });
              stream.on("error", reject);
            });
          }
        };
      }
    };
  }
}

// Usage in MCP tool
@tool({ name: "subscribe_miner_status" })
async subscribeMinerStatus(params: { minerId: string }) {
  const stream = await this.grpc.streamMinerStatus(params.minerId);

  // Publish to Redis pub/sub for real-time updates
  for await (const status of stream) {
    await this.redis.publish(`miner:${params.minerId}:status`, JSON.stringify(status));
  }
}
```

---

## 💾 Redis Caching Strategies

### Cache Invalidation Patterns

**Pattern 1: Time-Based TTL**
```typescript
// For data that changes slowly
async getFleetMetrics(): Promise<FleetMetrics> {
  const key = "cache:fleet:metrics";
  const ttl = 30; // 30 seconds

  const cached = await this.redis.get(key);
  if (cached) return JSON.parse(cached);

  const metrics = await this.computeFleetMetrics();
  await this.redis.setex(key, ttl, JSON.stringify(metrics));

  return metrics;
}
```

**Pattern 2: Event-Based Invalidation**
```typescript
// Invalidate when data changes
async updateMinerConfig(minerId: string, config: MinerConfig) {
  await this.grpc.updateConfig(minerId, config);

  // Invalidate all caches related to this miner
  await this.redis.del(`cache:miner:${minerId}:config`);
  await this.redis.del(`cache:miner:${minerId}:status`);
  await this.redis.del("cache:fleet:summary"); // Fleet summary includes this miner
}
```

**Pattern 3: Cache-Aside with Write-Through**
```typescript
// Read: Cache-aside
async getMinerStatus(minerId: string): Promise<MinerStatus> {
  const key = `cache:miner:${minerId}:status`;

  const cached = await this.redis.get(key);
  if (cached) return JSON.parse(cached);

  const status = await this.grpc.getStatus(minerId);
  await this.redis.setex(key, 10, JSON.stringify(status));

  return status;
}

// Write: Write-through
async setMinerStatus(minerId: string, status: MinerStatus) {
  // Update source
  await this.db.updateMinerStatus(minerId, status);

  // Update cache
  const key = `cache:miner:${minerId}:status`;
  await this.redis.setex(key, 10, JSON.stringify(status));
}
```

### Pub/Sub for Real-Time Updates

```typescript
// Publisher (from gRPC stream or webhook)
async publishMinerEvent(minerId: string, event: MinerEvent) {
  await this.redis.publish(`events:miner:${minerId}`, JSON.stringify(event));
  await this.redis.publish("events:fleet", JSON.stringify({ minerId, event }));
}

// Subscriber (in MCP server for real-time tool updates)
async subscribeToMinerEvents() {
  const subscriber = this.redis.duplicate();

  await subscriber.subscribe("events:fleet");

  subscriber.on("message", (channel, message) => {
    const { minerId, event } = JSON.parse(message);
    this.handleMinerEvent(minerId, event);
  });
}
```

---

## 🧪 Testing Strategies

### Unit Tests: Tools, Resources, Prompts

```typescript
// tests/unit/tools/update-firmware.test.ts
describe("updateMinerFirmware tool", () => {
  let mcpServer: MCPServer;
  let mockGrpc: jest.Mocked<GrpcClient>;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockGrpc = createMockGrpcClient();
    mockRedis = createMockRedis();
    mcpServer = new MCPServer({ grpc: mockGrpc, redis: mockRedis });
  });

  it("should start firmware update job", async () => {
    const result = await mcpServer.callTool("update_miner_firmware", {
      minerIds: ["miner-1"],
      version: "2.0.1"
    });

    expect(result.jobId).toBeDefined();
    expect(result.status).toBe("pending");
    expect(mockGrpc.updateFirmware).toHaveBeenCalledWith("miner-1", "2.0.1");
  });

  it("should handle batch updates", async () => {
    const result = await mcpServer.callTool("update_miner_firmware", {
      minerIds: ["miner-1", "miner-2", "miner-3"],
      version: "2.0.1"
    });

    expect(result.total).toBe(3);
    expect(mockGrpc.updateFirmware).toHaveBeenCalledTimes(3);
  });
});
```

### Integration Tests: gRPC + Redis

```typescript
// tests/integration/grpc-cache.test.ts
describe("gRPC + Redis integration", () => {
  let grpcClient: GrpcClient;
  let redis: Redis;

  beforeAll(async () => {
    // Use real Redis (test container)
    redis = new Redis(process.env.REDIS_URL);
    // Use mock gRPC (or test miner simulator)
    grpcClient = createMockGrpcClient();
  });

  it("should cache miner status for 10 seconds", async () => {
    const status1 = await getMinerStatusWithCache("miner-1");
    const status2 = await getMinerStatusWithCache("miner-1");

    expect(status1).toEqual(status2);
    expect(grpcClient.getStatus).toHaveBeenCalledTimes(1); // Only called once

    await sleep(11000); // Wait for cache to expire

    const status3 = await getMinerStatusWithCache("miner-1");
    expect(grpcClient.getStatus).toHaveBeenCalledTimes(2); // Called again
  });
});
```

### E2E Tests: Full MCP Server Workflow

```typescript
// tests/e2e/mcp-server.test.ts
describe("MCP Server E2E", () => {
  let mcpClient: MCPClient;

  beforeAll(async () => {
    // Start actual MCP server
    mcpClient = await startMCPServerForTesting();
  });

  it("should complete full firmware update workflow", async () => {
    // 1. List miners
    const miners = await mcpClient.callTool("list_miners", {});
    expect(miners.miners.length).toBeGreaterThan(0);

    // 2. Start firmware update
    const updateResult = await mcpClient.callTool("update_miner_firmware", {
      minerIds: [miners.miners[0].id],
      version: "2.0.1"
    });
    expect(updateResult.jobId).toBeDefined();

    // 3. Poll job status until complete
    let jobStatus;
    do {
      await sleep(5000);
      jobStatus = await mcpClient.callTool("check_job_status", {
        jobId: updateResult.jobId
      });
    } while (jobStatus.status === "running");

    expect(jobStatus.status).toBe("completed");
    expect(jobStatus.errors).toHaveLength(0);
  });
});
```

---

## 📚 Skills Reference

### Available Skills

#### 1. braiins-os (.claude/skills/braiins-os/)
**Purpose:** Braiins OS API, feeds, and documentation reference
**When to use:** Need Braiins OS API details, configuration options, or troubleshooting known issues
**Contents:**
- BOS+ API documentation (v1.8.0)
- Braiins OS Feeds structure
- Official Braiins Academy guides (limited - SPA rendering limitation)

**Example usage:**
```
"For details on the Braiins OS gRPC API endpoints, see .claude/skills/braiins-os/references/bos-plus-api-README.md"
```

#### 2. mcp-builder (docs/claude/skills-templates/mcp-builder/)
**Purpose:** General MCP server development guide (Python + TypeScript)
**When to use:** Building new MCP tools, resources, or prompts
**Contents:**
- 4-phase MCP development workflow
- Agent-centric design principles
- Input/output optimization patterns
- Evaluation harness creation

**Note:** This is a generic guide. For Braiins OS-specific patterns, create a `mcp-server-dev` skill based on this template.

### Planned Skills

#### mcp-server-dev (To be created)
**Purpose:** Braiins OS-specific MCP server development patterns
**Contents:**
- Mining operations workflow patterns
- Firmware update state machine
- Fleet management tools design
- gRPC + Redis integration patterns

#### grpc-client-dev (To be created)
**Purpose:** gRPC client patterns for Braiins OS miners
**Contents:**
- Connection pooling implementation
- Retry strategies for mining operations
- Stream handling for real-time updates
- Error handling specific to miners

#### redis-caching-patterns (To be created)
**Purpose:** Redis caching strategies for MCP server
**Contents:**
- Cache invalidation patterns
- TTL strategies for different data types
- Pub/Sub for real-time agent updates
- Cache warming for fleet operations

---

## 🛠️ Development Workflow

### Starting a Development Session

```bash
# 1. Start Redis (required for caching)
docker-compose up redis -d

# 2. Build TypeScript
npm run build

# 3. Run tests
npm test

# 4. Start MCP server in development mode
npm run dev
```

### Testing MCP Tools

**Manual Testing:**
```bash
# Use MCP inspector (if available)
mcp-inspector --server ./dist/index.js

# Or use Claude Code with stdio transport
# Configure in Claude settings:
{
  "mcpServers": {
    "braiins-os": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

**Automated Testing:**
```bash
# Unit tests
npm run test:unit

# Integration tests (requires Redis)
npm run test:integration

# E2E tests (requires test miner or simulator)
npm run test:e2e

# All tests with coverage
npm test
```

---

## 🚀 Deployment Considerations

### Environment Variables

Required:
```env
NODE_ENV=production
REDIS_URL=redis://localhost:6379
GRPC_TIMEOUT_MS=30000
```

Optional:
```env
LOG_LEVEL=info
CACHE_TTL_DEFAULT=30
MAX_GRPC_CONNECTIONS=100
```

### Docker Deployment

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --production
CMD ["node", "dist/index.js"]
```

---

## 🤝 Collaboration with Other Agents

### Architect Agent
- **Use for:** System design decisions, API design, architectural patterns
- **Handoff:** Architect designs → Builder implements

### Builder Agent
- **Use for:** Feature implementation, bug fixes, refactoring
- **Handoff:** Builder codes → Validator tests

### Validator Agent
- **Use for:** Testing, code review, quality assurance
- **Handoff:** Validator approves → Scribe documents

### Scribe Agent
- **Use for:** Documentation updates, API docs, troubleshooting guides
- **Handoff:** Scribe documents → DevOps deploys

### DevOps Agent
- **Use for:** Deployment, infrastructure, monitoring setup
- **Handoff:** DevOps deploys → Monitor in production

---

## 📋 Quick Reference

### Common Commands

```bash
# Development
npm run dev                  # Start development server
npm run build               # Build TypeScript
npm run type-check          # TypeScript type checking

# Testing
npm test                    # Run all tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
npm run test:e2e            # End-to-end tests
npm run test:coverage       # Generate coverage report

# Code Quality
npm run lint                # ESLint
npm run lint:fix            # Auto-fix linting issues
npm run format              # Prettier formatting
```

### File Structure

```
src/
├── index.ts              # MCP server entry point
├── server.ts             # Transport setup (STDIO/HTTP)
├── mcp/
│   ├── tools/           # MCP tools (agent-callable functions)
│   ├── resources/       # MCP resources (structured data)
│   └── prompts/         # MCP prompts (guided workflows)
├── api/
│   ├── grpc/           # gRPC client implementation
│   │   ├── client.ts   # gRPC client
│   │   ├── pool.ts     # Connection pooling
│   │   └── retry.ts    # Retry logic
│   └── rest/           # REST API endpoints
├── cache/
│   └── redis.ts        # Redis caching layer
├── models/             # Data models (TypeScript interfaces)
├── utils/              # Utility functions
└── types/              # TypeScript type definitions

tests/
├── unit/               # Unit tests
├── integration/        # Integration tests
└── e2e/                # End-to-end tests

.claude/
├── commands/           # Slash commands
├── agents/             # Agent configurations
└── skills/             # Development skills
    └── braiins-os/     # Braiins OS reference skill
```

---

## 📞 Support & Resources

### Documentation
- [README.md](./README.md) - Project overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - Implementation roadmap
- [.claude/AUDIT_REPORT.md](./.claude/AUDIT_REPORT.md) - Tooling audit & recommendations

### External Resources
- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [Braiins OS+ API](https://github.com/braiins/bos-plus-api)
- [gRPC Node.js Guide](https://grpc.io/docs/languages/node/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Project Status:** ✅ Foundation Complete | 🔄 Active Development
**Last Updated:** December 2025
**Maintainer:** Ryno Crypto Mining Services
