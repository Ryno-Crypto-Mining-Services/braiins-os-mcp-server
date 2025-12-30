---
description: "Test individual MCP tools in isolation with comprehensive validation of input schemas, error handling, and response formats"
allowed-tools: ["Read", "Grep", "Glob", "Bash(npm:*)", "Bash(node:*)", "Bash(find)", "Bash(grep)"]
author: "MCP Development Team"
version: "1.0"
---

# Test MCP Tools

## Purpose
Test individual MCP tools in isolation to verify they follow MCP best practices, handle errors gracefully, and return properly formatted responses.

## Testing Philosophy

MCP tools must be:
- **Agent-Centric**: Designed for AI agent consumption
- **Error-Tolerant**: Actionable error messages that guide agents
- **Schema-Valid**: Strict input validation with Zod/Pydantic
- **Mode-Aware**: Support concise (default) and detailed response modes
- **Well-Annotated**: Clear tool descriptions and parameter documentation

## Testing Workflow

### 1. Discover MCP Tools

```bash
# Find all MCP tool implementations
!find src/mcp/tools -name "*.ts" -o -name "*.py" | grep -v ".test"

# List tools from server registration
!grep -r "registerTool\|@tool" src/ | grep -v node_modules
```

### 2. Validate Tool Structure

For each tool, verify:

#### TypeScript Tools (Node.js MCP SDK)
```typescript
// Check tool registration
!grep -A 20 "export.*Tool" src/mcp/tools/*.ts

// Verify Zod schema exists
!grep -B 5 -A 10 "z.object" src/mcp/tools/*.ts

// Check annotations
!grep "@tool\|name:\|description:" src/mcp/tools/*.ts
```

#### Python Tools (FastMCP)
```python
# Check tool registration
!grep -A 20 "@mcp.tool\|@tool" src/tools/*.py

# Verify Pydantic schema
!grep -B 5 -A 10 "class.*BaseModel" src/tools/*.py

# Check docstrings
!grep -A 10 'def.*tool.*:' src/tools/*.py
```

### 3. Test Individual Tools

Create test script:

```typescript
// test-mcp-tools.ts
import { McpServer } from './src/server';

const testCases = [
  {
    tool: 'tool_name',
    validInput: { param1: 'value1' },
    invalidInput: { invalid_param: 'bad' },
    expectedOutput: { /* expected structure */ }
  },
  // ... more test cases
];

async function testTools() {
  for (const test of testCases) {
    console.log(`\n Testing ${test.tool}...`);

    // Test 1: Valid input
    try {
      const result = await server.callTool(test.tool, test.validInput);
      console.log('✅ Valid input accepted');

      // Verify output structure
      if (!matchesSchema(result, test.expectedOutput)) {
        console.error('❌ Output schema mismatch');
      }
    } catch (error) {
      console.error(`❌ Valid input rejected: ${error.message}`);
    }

    // Test 2: Invalid input
    try {
      await server.callTool(test.tool, test.invalidInput);
      console.error('❌ Invalid input accepted (should have failed)');
    } catch (error) {
      console.log(`✅ Invalid input rejected: ${error.message}`);

      // Verify error is actionable
      if (!isActionableError(error.message)) {
        console.warn('⚠️  Error message not actionable for agents');
      }
    }

    // Test 3: Concise vs Detailed mode
    if (test.tool.supportsDetailLevel) {
      const concise = await server.callTool(test.tool, { ...test.validInput, detailLevel: 'concise' });
      const detailed = await server.callTool(test.tool, { ...test.validInput, detailLevel: 'detailed' });

      console.log(`Concise response: ${JSON.stringify(concise).length} chars`);
      console.log(`Detailed response: ${JSON.stringify(detailed).length} chars`);

      if (JSON.stringify(detailed).length <= JSON.stringify(concise).length) {
        console.warn('⚠️  Detailed mode not providing more information');
      }
    }
  }
}
```

### 4. Run Automated Tests

```bash
# Run unit tests for MCP tools
!npm test -- --testPathPattern="mcp/tools" --verbose

# Run with coverage
!npm test -- --testPathPattern="mcp/tools" --coverage

# Run specific tool test
!npm test -- --testNamePattern="tool_name" --verbose
```

### 5. Validate MCP Best Practices

Create validation checklist:

```markdown
# MCP Tool Validation Checklist

## Tool: [tool_name]

### Schema Validation
- [ ] Input schema uses strict validation (`.strict()` in Zod, `extra="forbid"` in Pydantic)
- [ ] All required parameters marked as required
- [ ] Optional parameters have sensible defaults
- [ ] Parameter types match intended usage
- [ ] Descriptions are clear and complete

### Error Handling
- [ ] Invalid input returns descriptive error
- [ ] Error messages suggest remediation
- [ ] Error messages include example of correct usage
- [ ] Errors don't expose internal implementation details
- [ ] Network/API errors are retryable

### Response Format
- [ ] Supports concise mode (default, minimal tokens)
- [ ] Supports detailed mode (comprehensive information)
- [ ] Response structure is consistent
- [ ] No unnecessary data in concise mode
- [ ] Detailed mode adds genuinely useful information

### Tool Annotations
- [ ] `name` is descriptive and follows naming conventions
- [ ] `description` clearly explains what the tool does
- [ ] `inputSchema` is properly defined
- [ ] Tool hints set correctly:
  - [ ] `readOnlyHint` - true if tool doesn't modify state
  - [ ] `destructiveHint` - true if tool deletes/destroys data
  - [ ] `idempotentHint` - true if same result when called multiple times
  - [ ] `openWorldHint` - true if tool interacts with external systems

### Agent-Centric Design
- [ ] Tool purpose is clear from description
- [ ] Parameters have helpful descriptions
- [ ] Examples provided for complex parameters
- [ ] Error messages guide agents to solution
- [ ] Tool doesn't require human intervention mid-execution

### Performance
- [ ] Response time < 2 seconds for typical usage
- [ ] Long operations return job ID for async polling
- [ ] No unnecessary API calls
- [ ] Caching used appropriately
```

### 6. Generate Test Report

Create **MCP_TOOL_TEST_RESULTS.md**:

```markdown
# MCP Tool Test Results

**Report Generated**: [ISO 8601 timestamp]
**Project**: [Project Name]
**Tools Tested**: [N]

---

## 📊 Summary

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| Total Tools | [N] | N/A | ℹ️ |
| Tests Passed | [N] | 100% | ✅ / ❌ |
| Schema Valid | [N] | 100% | ✅ / ❌ |
| Errors Actionable | [N] | 100% | ✅ / ⚠️ |
| **Pass Rate** | **[X]%** | **100%** | **✅ / ❌** |

---

## ✅ Tools Passing All Tests

### Tool: register_miner
**File**: src/mcp/tools/register-miner.ts
**Tests**: 8/8 passed
**Schema**: ✅ Strict validation
**Errors**: ✅ Actionable
**Modes**: ✅ Concise + Detailed
**Performance**: 145ms average

**Test Results**:
- ✅ Valid input accepted
- ✅ Invalid input rejected
- ✅ Required parameters enforced
- ✅ Error messages are actionable
- ✅ Concise mode uses minimal tokens (120 chars)
- ✅ Detailed mode provides comprehensive info (580 chars)
- ✅ Tool annotations complete
- ✅ No performance issues

---

## ❌ Tools Failing Tests

### Tool: update_miner_firmware
**File**: src/mcp/tools/update-firmware.ts
**Tests**: 5/8 passed
**Issues Found**: 3

**Failures**:
1. ❌ **Missing detailLevel support**
   - Error: Tool doesn't support concise/detailed modes
   - Impact: Always returns full response (unnecessary tokens)
   - Fix: Add `detailLevel?: 'concise' | 'detailed'` parameter

2. ❌ **Non-actionable error message**
   - Input: `{ minerId: "invalid-id" }`
   - Current Error: "Miner not found"
   - Expected Error: "Miner with ID 'invalid-id' not found. Try 'list_miners' to see available miners."
   - Fix: Enhance error message with remediation

3. ⚠️ **Performance concern**
   - Average response time: 3.2 seconds
   - Target: < 2 seconds
   - Recommendation: Consider returning job ID for async polling

---

## ⚠️ Warnings & Recommendations

### Missing Best Practices

**Tool**: get_miner_logs
- ⚠️ No `openWorldHint` annotation (tool interacts with external miners)
- ⚠️ Error doesn't suggest checking connectivity with `ping_miner`

**Tool**: factory_reset
- ⚠️ Missing `destructiveHint: true` annotation
- ⚠️ Should require explicit confirmation parameter

### Schema Issues

**Tool**: update_pool_config
- ⚠️ Schema not strict (accepts unknown parameters)
- ⚠️ Optional parameters lack default values

### Performance Optimization

**Slow Tools** (> 2 seconds):
- update_miner_firmware (3.2s) - Consider async operation
- get_fleet_status (2.8s) - Implement caching

---

## 📈 Tool Coverage Analysis

### Tools by Category

| Category | Count | Tests Pass | Coverage |
|----------|-------|------------|----------|
| **Miner Management** | 5 | 4/5 | 80% |
| **Firmware Operations** | 3 | 2/3 | 66% |
| **Fleet Monitoring** | 2 | 2/2 | 100% |
| **Configuration** | 3 | 3/3 | 100% |
| **Utilities** | 3 | 3/3 | 100% |

### Test Coverage

| Test Type | Coverage | Target | Status |
|-----------|----------|--------|--------|
| **Schema Validation** | 95% | 100% | ⚠️ |
| **Error Handling** | 87% | 100% | ⚠️ |
| **Response Modes** | 75% | 100% | ❌ |
| **Annotations** | 92% | 100% | ⚠️ |
| **Performance** | 88% | 100% | ⚠️ |

---

## 🎯 Recommendations

### Immediate Actions
1. ❌ [CRITICAL] Fix update_miner_firmware: Add detailLevel support
2. ❌ [CRITICAL] Enhance error messages for 3 tools (see failures above)
3. ⚠️ [HIGH] Add missing tool annotations (openWorldHint, destructiveHint)

### Short-Term Improvements
- Implement caching for slow tools (get_fleet_status)
- Add schema strictness to all tools
- Standardize error message format across all tools

### Long-Term Goals
- 100% test coverage for all MCP tools
- < 1 second average response time
- All tools support concise/detailed modes

---

## 📋 Testing Environment

**Node/Python Version**: [Version]
**MCP SDK Version**: [Version]
**Test Framework**: [Jest/Pytest]
**Total Test Runtime**: [X.XXs]

---

## 📞 Quick Actions

### Re-test Specific Tool
```bash
npm test -- --testNamePattern="update_miner_firmware" --verbose
```

### Test All MCP Tools
```bash
npm test -- --testPathPattern="mcp/tools" --coverage
```

### Validate Tool Against Checklist
```bash
# Use validation checklist above for manual review
```

---

**Next Steps**:
1. Fix all CRITICAL issues
2. Re-run `/test-mcp-tools`
3. Verify all tests pass before deployment
```

### 7. Display Test Summary

Show formatted output:

```
╔════════════════════════════════════════════════════╗
║        MCP TOOLS TESTED SUCCESSFULLY               ║
╚════════════════════════════════════════════════════╝

PROJECT: [Project Name]
TOOLS TESTED: [N]

SUMMARY:
  Schema Valid:      [N]/[N] ✅ / ❌
  Error Handling:    [N]/[N] ✅ / ❌
  Response Modes:    [N]/[N] ✅ / ❌
  Annotations:       [N]/[N] ✅ / ❌
  Performance:       [N]/[N] ✅ / ❌

OVERALL: [N]/[N] tools passing ✅ / ❌

CRITICAL ISSUES: [N]
  [List critical failures]

WARNINGS: [N]
  [List warnings]

Full Report: MCP_TOOL_TEST_RESULTS.md

NEXT STEPS:
  ✅ All tools pass - Ready for production
  ❌ Tools failing - Fix before deployment
  ⚠️ Warnings - Address before next release
```

## Quality Gates

- ✅ **Schema Validation**: 100% strict validation required
- ✅ **Error Messages**: 100% actionable required
- ⚠️ **Response Modes**: 80%+ support concise/detailed
- ✅ **Annotations**: 100% complete required
- ✅ **Performance**: 90%+ under 2 seconds

## Key Features

- **Automated Testing**: Runs all MCP tool tests
- **Best Practice Validation**: Checks against MCP guidelines
- **Actionable Reports**: Specific issues with remediation steps
- **Performance Monitoring**: Identifies slow tools
- **Schema Validation**: Ensures strict input validation
- **Error Quality**: Verifies errors guide agents to solutions

## When to Use /test-mcp-tools

- After implementing new MCP tools
- Before creating a PR with tool changes
- Before production deployment
- As part of CI/CD pipeline
- After refactoring MCP tool implementations
- When debugging agent interaction issues

## Related Commands

- `/mcp-init` - Initialize new MCP server
- `/test-all` - Run full test suite (includes MCP tool tests)
- `/validate-mcp-resources` - Validate MCP resources
- `/mcp-dev-session` - Start MCP development session

## Skills Used

- `mcp-builder` (Phase 3: Review and Testing)
- `validator-role-skill` (Testing patterns)

---

**Status**: ✅ Production Ready
**Version**: 1.0
**Maintained By**: MCP Development Team
