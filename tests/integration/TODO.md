# Integration Tests TODO

## High Priority

### 1. Real Integration Tests for Performance Baseline Tool

**Status**: ✅ **COMPLETED** (2025-12-31)
**Priority**: High
**Effort**: 4-6 hours (actual: ~1 hour)

**Completed Implementation**:
- ✅ Created `run-performance-baseline.integration.test.ts` with true integration tests
- ✅ Uses real JobService, MinerService, BraiinsClient instances
- ✅ Mocks only at gRPC client boundary (external dependency)
- ✅ Tests real background processing (`processBaselineTest` function)
- ✅ Validates real metric extraction from `MinerStatusSummary` structures
- ✅ Helper functions for type-safe fixture creation
- ✅ All tests pass ESLint and TypeScript strict mode checks

**What Was Implemented**:
1. **Real Background Processing Tests**
   - Test that `processBaselineTest` function actually runs
   - Validate it calls `collectModeMetrics` for each power mode
   - Verify it updates job progress correctly
   - Confirm it stores results and completes the job

2. **Real Metric Extraction Tests**
   - Test extraction from actual `MinerStatusSummary` nested structures:
     - `status.hashboards?.hashboards[].stats?.hashrate?.terahash_per_second`
     - `status.hashboards?.hashboards[].highest_chip_temp?.celsius`
     - `status.tunerState?.mode_state?.powertargetmodestate?.current_target?.watt`
   - Test unit conversions (GH/s → TH/s)
   - Test aggregation logic (sum hashrates, max temperature)
   - Test fallback values (power from tuner state or target)

3. **Error Propagation Tests**
   - Test that errors from `collectModeMetrics` are caught and stored in job
   - Test that gRPC connection failures fail the job gracefully
   - Test that `getMinerStatus` failures during sampling are handled

4. **Recommendation Logic Tests**
   - Test optimal mode selection (lowest efficiency)
   - Test temperature warnings (>80°C, >70°C)
   - Test efficiency gap calculations (>20%)

**Recommended Pattern**:
Follow the pattern from `error-scenarios.test.ts`:
```typescript
// Use real services with mocked external boundaries
let context: ToolContext;
let realJobService: JobService;
let realMinerService: MinerService;

beforeEach(() => {
  // Mock only at the gRPC boundary
  mockGrpcClient = createMockGrpcClient();

  // Use real services
  realJobService = new JobService(/* with in-memory store */);
  realMinerService = new MinerService(mockGrpcClient);

  context = {
    jobService: realJobService,
    minerService: realMinerService,
  } as ToolContext;
});
```

**Acceptance Criteria**:
- [x] Test real `processBaselineTest` execution with short duration (60s)
- [x] Validate metric extraction with realistic `MinerStatusSummary` fixtures
- [x] Test all error paths in background processing
- [x] Verify recommendation generation with various metric combinations
- [x] Use real `JobService` with in-memory persistence
- [x] Mock only at gRPC client boundary
- [x] All tests pass ESLint and TypeScript strict mode

**Files Created**:
- ✅ `tests/integration/mcp/tools/run-performance-baseline.integration.test.ts` (true integration tests)

**Files Retained**:
- ✅ `tests/integration/mcp/tools/run-performance-baseline.workflow.test.ts` (workflow simulation)

Both test files now coexist and serve complementary purposes:
- **Integration tests**: Validate real background processing and metric extraction
- **Workflow tests**: Validate multi-step workflows and state transitions

---

## Medium Priority

### 2. Add Integration Test Documentation

**Status**: Needed
**Priority**: Medium
**Effort**: 1-2 hours

Create `tests/integration/README.md` to document:
- Philosophy: What makes a test "integration" vs "unit" vs "workflow simulation"
- Patterns: When to use each pattern
- Examples: Reference existing tests as templates

**Template**:
```markdown
# Integration Tests

## Test Categories

### Unit Tests (`tests/unit/`)
- Mock everything except the code under test
- Fast, isolated, deterministic
- Example: `run-performance-baseline.test.ts`

### Integration Tests (`tests/integration/`)
- Use real service implementations
- Mock only external boundaries (gRPC, HTTP, database)
- Slower but validate real integration points
- Example: `error-scenarios.test.ts`

### Workflow Simulation Tests (`tests/integration/**/*.workflow.test.ts`)
- Validate multi-step workflows and state transitions
- Mock services but maintain persistent state
- Focus on workflow logic, not implementation
- Example: `run-performance-baseline.workflow.test.ts`
```

---

## Low Priority

### 3. Extract Reusable Test Fixtures

**Status**: Nice to have
**Priority**: Low
**Effort**: 2-3 hours

Extract common patterns into reusable fixtures:
- `createJobStoreFixture()` - Persistent job store for workflow tests
- `createRealisticMinerStatus()` - Factory for `MinerStatusSummary` test data
- `waitForJobCompletion()` - Helper for polling job status

**Benefits**:
- Reduce test boilerplate
- Ensure consistency across tests
- Make tests more maintainable

---

**Last Updated**: 2025-12-31
**Owner**: Development Team
