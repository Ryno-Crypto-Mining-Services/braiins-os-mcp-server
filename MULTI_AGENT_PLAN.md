# Multi-Agent Plan: Mining Configuration Tools Suite

## MCP Development Goal

Build 5 advanced mining configuration tools for Braiins OS miners with comprehensive validation, batch operation support, and background job tracking for long-running operations.

## Parallel Execution Strategy

- **Isolation Method**: Git Worktrees (isolated src/mcp/tools/ directories)
- **Agent Distribution**: 5 agents across 5 independent MCP tool components
- **Coordination**: Shared MULTI_AGENT_PLAN.md with atomic status updates
- **Skills**: mcp-server-dev (all agents), braiins-os (API reference)
- **Merge Strategy**: Validate with /test-mcp-tools before integration

## Task Assignment Matrix

| Task ID | MCP Component | Skill | Worktree Path | Branch | Parallel Group | Status | Dependencies |
|---------|---------------|-------|---------------|--------|----------------|--------|--------------|
| T1 | Tool: configure_autotuning | mcp-server-dev | ../worktrees/mcp-autotuning | mcp/autotuning | A | ✅ Completed | - |
| T2 | Tool: configure_fan_control | mcp-server-dev | ../worktrees/mcp-fan-control | mcp/fan-control | A | Not Started | - |
| T3 | Tool: configure_network | mcp-server-dev | ../worktrees/mcp-network | mcp/network | A | Not Started | - |
| T4 | Tool: configure_power_schedule | mcp-server-dev | ../worktrees/mcp-power-schedule | mcp/power-schedule | A | Not Started | - |
| T5 | Tool: run_performance_baseline | mcp-server-dev | ../worktrees/mcp-baseline | mcp/baseline | A | Not Started | - |

**Parallel Groups**:
- Group A: Independent tools (5 agents in parallel, all can start immediately)

## Tool Specifications

### T1: configure_autotuning

**Purpose**: Configure autotuning mode (power optimization, hashrate maximization, efficiency balance)

**Input Schema**:
```typescript
{
  minerIds: string[];           // 1-100 miners
  mode: "power" | "hashrate" | "efficiency";
  targetPower?: number;         // Watts (for power mode)
  targetHashrate?: number;      // TH/s (for hashrate mode)
  validate?: boolean;           // Default: true
}
```

**Expected Output**:
```typescript
{
  jobId: string;               // Background job ID
  status: "pending" | "running" | "completed";
  applied: number;             // Count of miners configured
  failed: number;              // Count of failures
  estimatedDuration: number;   // Seconds
}
```

**Key Implementation Details**:
- Validate mode compatibility with miner model
- Support batch operations (up to 100 miners)
- Return job ID for async tracking
- Cache invalidation: `cache:miner:${id}:config` and `cache:fleet:summary`

**Tests Required**:
- Single miner configuration
- Batch operation (3+ miners)
- Invalid mode rejection
- Partial failure handling
- Job tracking workflow

---

### T2: configure_fan_control

**Purpose**: Configure fan speed and mode (auto, manual percentage)

**Input Schema**:
```typescript
{
  minerIds: string[];           // 1-100 miners
  mode: "auto" | "manual";
  fanSpeed?: number;            // 0-100 (for manual mode)
  minFanSpeed?: number;         // 0-100 (for auto mode)
  maxFanSpeed?: number;         // 0-100 (for auto mode)
  validate?: boolean;           // Default: true
}
```

**Expected Output**:
```typescript
{
  success: number;             // Count of miners configured
  failed: number;              // Count of failures
  warnings: string[];          // Safety warnings (e.g., "Fan speed below recommended")
}
```

**Key Implementation Details**:
- Safety validation (min 30% for hashboards)
- Support both auto and manual modes
- Real-time application (no background job)
- Cache invalidation: `cache:miner:${id}:status`

**Tests Required**:
- Auto mode configuration
- Manual mode with percentage
- Safety threshold enforcement (< 30%)
- Batch operation validation
- Mode switching test

---

### T3: configure_network

**Purpose**: Update network configuration (IP, DNS, gateway)

**Input Schema**:
```typescript
{
  minerId: string;             // Single miner only
  ipAddress?: string;          // IPv4 with CIDR
  gateway?: string;            // IPv4
  dnsServers?: string[];       // Up to 3 DNS servers
  hostname?: string;           // Optional hostname
  validateConnectivity?: boolean; // Default: true
}
```

**Expected Output**:
```typescript
{
  success: boolean;
  previousConfig: NetworkConfig;
  newConfig: NetworkConfig;
  connectivityTest: {
    reachable: boolean;
    latency: number;           // ms
  }
}
```

**Key Implementation Details**:
- Single miner operation only (safety)
- Validate IP/CIDR format before applying
- Test connectivity after change
- Rollback support if connectivity test fails
- Cache invalidation: `cache:miner:${id}:config`

**Tests Required**:
- Valid IP configuration
- Invalid IP format rejection
- Connectivity test success/failure
- Rollback on connectivity loss
- DNS server validation

---

### T4: configure_power_schedule

**Purpose**: Set time-based power profiles (cron-like scheduling)

**Input Schema**:
```typescript
{
  minerIds: string[];           // 1-100 miners
  schedules: Array<{
    cron: string;               // Cron expression
    powerLimit: number;         // Watts
    mode: "enable" | "disable"; // Miner on/off
  }>;
  timezone?: string;            // Default: "UTC"
  validate?: boolean;           // Default: true
}
```

**Expected Output**:
```typescript
{
  success: number;             // Count of miners configured
  failed: number;              // Count of failures
  schedules: Array<{
    cron: string;
    nextExecution: string;     // ISO timestamp
  }>;
}
```

**Key Implementation Details**:
- Validate cron expressions
- Support multiple schedules per miner
- Timezone awareness (default UTC)
- Persistent storage (survives reboot)
- Cache invalidation: `cache:miner:${id}:config`

**Tests Required**:
- Single schedule creation
- Multiple schedules per miner
- Invalid cron expression rejection
- Timezone conversion validation
- Batch operation test

---

### T5: run_performance_baseline

**Purpose**: Run diagnostic performance test to measure optimal hashrate, power, and efficiency

**Input Schema**:
```typescript
{
  minerId: string;             // Single miner only
  duration?: number;           // Test duration in seconds (default: 300)
  modes?: Array<"low" | "medium" | "high">; // Power modes to test
  collectMetrics?: boolean;    // Default: true
}
```

**Expected Output**:
```typescript
{
  jobId: string;               // Background job ID
  status: "pending" | "running" | "completed";
  estimatedDuration: number;   // Seconds
  results?: {
    baseline: {
      hashrate: number;        // TH/s
      power: number;           // Watts
      efficiency: number;      // J/TH
      temperature: number;     // °C
    };
    recommendations: string[];
  };
}
```

**Key Implementation Details**:
- Long-running operation (5-15 minutes)
- Background job with progress tracking
- Collect metrics at 30-second intervals
- Generate optimization recommendations
- Cache results for 24 hours: `cache:miner:${id}:baseline`

**Tests Required**:
- Baseline test initiation
- Job status polling
- Metric collection validation
- Multiple power mode testing
- Recommendation generation

---

## Success Criteria (MCP-Specific)

- [ ] All 5 MCP tools implemented with Zod input validation
- [ ] `/test-mcp-tools` passing for all tools
- [ ] Unit tests passing: `npm test -- --testPathPattern="mcp/tools/(configure_autotuning|configure_fan_control|configure_network|configure_power_schedule|run_performance_baseline)"`
- [ ] TypeScript compilation: `npm run type-check` (zero errors)
- [ ] MCP server starts: `npm run build && node dist/index.js`
- [ ] Documentation updated in docs/API.md (all 5 tools)
- [ ] Integration tests for batch operations
- [ ] Final merge to main branch successful

## Communication Protocol

- **Status Updates**: Agents update this file's Status column atomically
- **Blockers**: Add comments in "Notes and Blockers" section below
- **Questions**: Create issues in QUESTIONS.md for orchestrator review
- **Handoffs**: Document completion artifacts in respective task rows

## Merge Strategy

1. Validate each tool independently with MCP inspector
2. Run full test suite: `npm test`
3. Type-check: `npm run type-check`
4. Lint: `npm run lint`
5. Update API.md with all 5 tools
6. Create integration branch: `git checkout -b feature/mining-config-tools-integration`
7. Merge all 5 tool branches
8. Final validation with /test-mcp-tools
9. Create PR to main

## Estimated Timeline

- **Worktree Setup**: 5 minutes
- **Agent Spawn**: 5 minutes
- **Parallel Development**: 45-60 minutes (5 agents working simultaneously)
- **Integration & Testing**: 15 minutes
- **Documentation**: 10 minutes
- **Total**: ~75-90 minutes

## Notes and Blockers

### T1: configure_autotuning - COMPLETED ✅
**Completed**: 2025-12-30
**Agent**: Builder (Claude Sonnet 4.5)
**Artifacts**:
- Tool implementation: `src/mcp/tools/configure-autotuning.ts`
- Unit tests: `tests/unit/mcp/tools/configure-autotuning.test.ts`
- Test results: 17/17 tests passing
- TypeScript compilation: ✅ No errors
- ESLint: ✅ Passing

**Implementation Notes**:
- Supports 3 modes: power, hashrate, efficiency
- Efficiency mode calculates balanced power target (80% of rated power)
- Batch operation support (1-100 miners)
- Background job tracking via JobService
- Comprehensive Zod validation
- Cache invalidation implemented

---

**Plan Version**: 1.0.0
**Created**: 2025-12-30
**Orchestrator Model**: Claude Sonnet 4.5
**Total Tasks**: 5
**Parallel Groups**: 1 (Group A - all tools independent)
