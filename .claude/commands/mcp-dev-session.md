---
description: "Initialize specialized MCP development session with context loading, skill activation, and project-specific setup"
allowed-tools: ["Read", "Grep", "Glob", "Bash(git:*)", "Bash(npm:*)", "TodoWrite", "Skill(mcp-server-dev)", "Skill(braiins-os)", "Skill(grpc-client-dev)", "Skill(redis-caching-patterns)"]
author: "MCP Development Team"
version: "1.0"
---

# MCP Development Session

## Purpose
Initialize a specialized development session for MCP server work with automatic context loading, skill activation, and project-specific environment setup.

## Session Initialization Workflow

### 1. Load Project Context

```bash
# Show current branch
!git branch --show-current

# Show uncommitted changes
!git status --porcelain

# Show recent MCP-related commits
!git log --oneline --decorate --grep="mcp\|tool\|resource\|prompt" -10

# List MCP server files
!find src/mcp -type f -name "*.ts" -o -name "*.py" | head -20
```

### 2. Read MCP Server Documentation

Load key MCP-specific documentation:

```markdown
# Required Reading (Auto-loaded)
- @CLAUDE.md - Project-specific MCP patterns
- @src/mcp/tools/README.md - Tool development guide (if exists)
- @src/mcp/resources/README.md - Resource patterns (if exists)
- @docs/API.md - MCP server API documentation (if exists)
- @.claude/skills/mcp-server-dev/SKILL.md - MCP development skill
```

### 3. Activate MCP Development Skills

**Primary Skill**: `mcp-server-dev`
```
Loading: MCP server development patterns
- Tool creation (agent-centric design)
- Resource development (URI patterns, caching)
- Prompt templates (guided workflows)
- Testing strategies (MCP-specific)
```

**Supporting Skills** (Load on-demand):
- `braiins-os` - Braiins OS API reference
- `grpc-client-dev` - gRPC patterns for miners
- `redis-caching-patterns` - Caching strategies
- `builder-role-skill` - TDD workflow
- `validator-role-skill` - Testing patterns

### 4. Assess Current MCP Server State

```bash
# Count existing MCP components
TOOLS=$(find src/mcp/tools -name "*.ts" -o -name "*.py" | wc -l)
RESOURCES=$(find src/mcp/resources -name "*.ts" -o -name "*.py" | wc -l)
PROMPTS=$(find src/mcp/prompts -name "*.ts" -o -name "*.py" | wc -l)

echo "MCP Server Components:"
echo "  Tools: $TOOLS"
echo "  Resources: $RESOURCES"
echo "  Prompts: $PROMPTS"

# Check MCP server health
!npm run type-check 2>&1 | grep -E "error|warning" | head -10
!npm test -- --testPathPattern="mcp" --passWithNoTests 2>&1 | tail -5
```

### 5. Check MCP Dependencies

```bash
# Verify MCP SDK installed
!npm list @modelcontextprotocol/sdk 2>/dev/null || \
  pip list | grep fastmcp 2>/dev/null

# Check gRPC dependencies (if using gRPC)
!npm list @grpc/grpc-js 2>/dev/null || \
  pip list | grep grpcio 2>/dev/null

# Check Redis connection (if using Redis)
!redis-cli ping 2>/dev/null || echo "Redis not running (may be expected)"
```

### 6. Gather Session Intent

Prompt user:

```
╔════════════════════════════════════════════════════╗
║        MCP DEVELOPMENT SESSION SETUP               ║
╚════════════════════════════════════════════════════╝

MCP Server: [Project Name]
Components: [N] tools, [M] resources, [K] prompts

What would you like to work on?

1. **Add New Tool**
   - Implement new MCP tool
   - Add tests and documentation
   - Register in server

2. **Add New Resource**
   - Create resource with URI pattern
   - Implement caching strategy
   - Validate schema

3. **Add New Prompt**
   - Design guided workflow
   - Create prompt template
   - Test with example scenarios

4. **Refactor Existing Components**
   - Improve tool/resource design
   - Optimize caching strategies
   - Enhance error messages

5. **Testing & Validation**
   - Run /test-mcp-tools
   - Run /validate-mcp-resources
   - Create evaluation harness

6. **Documentation**
   - Update API documentation
   - Add usage examples
   - Create troubleshooting guide

Your choice (1-6): ___
```

### 7. Create Session Log

Create **MCP_DEV_SESSION_LOG.md**:

```markdown
# MCP Development Session - [DATE] [TIME]

## Session Metadata
- **Start Time**: [ISO 8601 timestamp]
- **Active Branch**: [branch name]
- **Session Goal**: [User's selected goal]

## MCP Server State
- **Tools**: [N] implemented
- **Resources**: [M] implemented
- **Prompts**: [K] implemented
- **Test Coverage**: [X]%
- **TypeScript Errors**: [N]

## Skills Loaded
- ✅ mcp-server-dev (primary)
- ✅ braiins-os (API reference)
- [ ] grpc-client-dev (on-demand)
- [ ] redis-caching-patterns (on-demand)
- [ ] builder-role-skill (on-demand)

## Context Loaded
- CLAUDE.md ✓
- MCP tool documentation ✓
- Recent MCP commits ✓
- Server health check ✓

## Work Plan
[Created based on user's selected goal]

1. [ ] Task 1
2. [ ] Task 2
3. [ ] Task 3

---

## Work Log

### [HH:MM] Session Started
- Loaded mcp-server-dev skill
- Current components: [N] tools, [M] resources, [K] prompts
- Goal: [User's goal]

### [HH:MM] [Activity description]
[Log entries as work progresses]

---
```

### 8. Load Appropriate Workflow

Based on user's choice, load the relevant workflow:

#### If "Add New Tool" (Choice 1):

```markdown
# Tool Development Workflow

**Using**: mcp-server-dev skill (Phase 2: Implementation)

## Steps

1. **Design Tool**:
   - Define tool purpose
   - Design input schema (Zod/Pydantic)
   - Plan output format (concise vs detailed)
   - Identify error scenarios

2. **Implement Tool**:
   ```typescript
   // Create src/mcp/tools/[tool-name].ts
   // - Import dependencies
   // - Define Zod schema
   // - Implement handler with error handling
   // - Add tool annotations
   // - Export tool
   ```

3. **Register Tool**:
   ```typescript
   // Update src/mcp/server.ts
   // - Import tool
   // - Register with server.tools.register()
   ```

4. **Write Tests**:
   ```typescript
   // Create tests/unit/mcp/tools/[tool-name].test.ts
   // - Test valid input
   // - Test invalid input
   // - Test error scenarios
   // - Test response modes (concise/detailed)
   ```

5. **Validate**:
   ```bash
   /test-mcp-tools
   ```

Ready to begin! What tool would you like to create?
```

#### If "Add New Resource" (Choice 2):

```markdown
# Resource Development Workflow

**Using**: mcp-server-dev skill + redis-caching-patterns skill

## Steps

1. **Design Resource**:
   - Define URI pattern
   - Plan data structure
   - Determine cache TTL (based on volatility)
   - Identify invalidation triggers

2. **Implement Resource**:
   ```typescript
   // Create src/mcp/resources/[resource-name].ts
   // - Import dependencies
   // - Define getResource handler
   // - Implement caching layer
   // - Add cache invalidation
   // - Export resource
   ```

3. **Register Resource**:
   ```typescript
   // Update src/mcp/server.ts
   // - Import resource
   // - Register with server.resources.register()
   ```

4. **Write Tests**:
   ```typescript
   // Create tests/unit/mcp/resources/[resource-name].test.ts
   // - Test URI resolution
   // - Test caching behavior
   // - Test cache invalidation
   // - Test schema consistency
   ```

5. **Validate**:
   ```bash
   /validate-mcp-resources
   ```

Ready to begin! What resource would you like to create?
```

#### If "Testing & Validation" (Choice 5):

```markdown
# MCP Testing Workflow

## Comprehensive MCP Testing

### 1. Test MCP Tools
```bash
/test-mcp-tools
```

Validates:
- Input schema strictness
- Error message quality
- Response mode support
- Tool annotations
- Performance

### 2. Validate MCP Resources
```bash
/validate-mcp-resources
```

Validates:
- URI pattern consistency
- Caching strategies
- Cache invalidation
- Schema consistency

### 3. Run Full Test Suite
```bash
/test-all
```

Runs:
- Unit tests
- Integration tests
- E2E tests (if implemented)

### 4. Create Evaluation Harness (Optional)
```bash
/mcp-evaluation-create
```

Creates 10 complex evaluation questions to test MCP server

Ready to begin testing!
```

### 9. Display Session Summary

Show formatted output:

```
╔════════════════════════════════════════════════════╗
║     MCP DEVELOPMENT SESSION INITIALIZED            ║
╚════════════════════════════════════════════════════╝

PROJECT: [Project Name]
BRANCH: [active-branch]
MODE: MCP Development

MCP SERVER STATE:
  Tools:      [N] implemented
  Resources:  [M] implemented
  Prompts:    [K] implemented
  Tests:      [X]% coverage

SKILLS LOADED:
  • mcp-server-dev (primary)
  • braiins-os (reference)
  • [Other skills loaded]

CONTEXT: Fully loaded
SESSION GOAL: [User's selected goal]

SESSION LOG: MCP_DEV_SESSION_LOG.md

Ready to begin MCP development!
```

## Skills-First Benefits for MCP Development

### Why Single Agent + Skills?

**Token Efficiency**:
- Single agent with progressive skill loading: 5-7x baseline
- Multi-agent coordination: 15x baseline
- **Savings**: 35% fewer tokens with skills-first

**Context Management**:
- Skills maintain context throughout workflow
- No context loss between tool/resource/prompt development
- Better understanding of MCP server architecture

**Simplicity**:
- One agent, multiple skills
- No coordination overhead
- Easier to use and understand

### When to Switch to Multi-Agent

Use `/mcp-dev-orchestrator` instead when:
- Building 6+ tools in parallel
- Each tool requires independent API research
- Time-sensitive deliverables
- Exploring multiple implementation approaches

## Key Features

- **MCP-Specific Context**: Loads MCP server state and documentation
- **Skill Activation**: Automatically loads mcp-server-dev skill
- **Workflow Guidance**: Provides step-by-step workflows based on goal
- **Session Logging**: Tracks all MCP development activities
- **Quality Gates**: Integrated testing and validation commands

## When to Use /mcp-dev-session

- Starting MCP server development work
- Adding new tools/resources/prompts
- Refactoring existing MCP components
- Testing and validation workflows
- Documentation updates

## Related Commands

- `/mcp-init` - Initialize new MCP server project
- `/test-mcp-tools` - Test MCP tools
- `/validate-mcp-resources` - Validate MCP resources
- `/mcp-dev-orchestrator` - Multi-agent MCP development
- `/close-session` - End session with summary

## Skills Used

- **Primary**: `mcp-server-dev` (all phases)
- **Reference**: `braiins-os` (API documentation)
- **On-Demand**: `grpc-client-dev`, `redis-caching-patterns`, `builder-role-skill`, `validator-role-skill`

---

**Status**: ✅ Production Ready
**Version**: 1.0
**Paradigm**: Skills-First (Single Agent)
**Maintained By**: MCP Development Team
