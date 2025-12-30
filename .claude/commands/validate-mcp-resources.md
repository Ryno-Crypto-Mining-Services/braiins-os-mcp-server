---
description: "Validate MCP resource definitions for proper URIs, caching strategies, and data freshness"
allowed-tools: ["Read", "Grep", "Glob", "Bash(npm:*)", "Bash(node:*)", "Bash(find)", "Bash(redis-cli:*)"]
author: "MCP Development Team"
version: "1.0"
---

# Validate MCP Resources

## Purpose
Validate MCP resource definitions to ensure they follow best practices for URI design, caching strategies, data freshness, and agent-centric access patterns.

## Resource Validation Philosophy

MCP resources must be:
- **URI-Addressable**: Consistent, predictable URI patterns
- **Cacheable**: Appropriate TTL for data volatility
- **Fresh**: Cache invalidation on data changes
- **Structured**: Consistent JSON schemas
- **Documented**: Clear descriptions and usage examples

## Validation Workflow

### 1. Discover MCP Resources

```bash
# Find all MCP resource implementations
!find src/mcp/resources -name "*.ts" -o -name "*.py" | grep -v ".test"

# List resources from server registration
!grep -r "registerResource\|@resource" src/ | grep -v node_modules
```

### 2. Validate Resource Structure

For each resource, verify:

#### TypeScript Resources (Node.js MCP SDK)
```typescript
// Check resource registration
!grep -A 20 "export.*Resource" src/mcp/resources/*.ts

// Verify URI patterns
!grep "uri:" src/mcp/resources/*.ts

// Check caching implementation
!grep -B 5 -A 10 "cache\|ttl\|expire" src/mcp/resources/*.ts
```

#### Python Resources (FastMCP)
```python
# Check resource registration
!grep -A 20 "@mcp.resource\|@resource" src/resources/*.py

# Verify URI patterns
!grep "uri=" src/resources/*.py

# Check cache decorators
!grep -B 5 -A 10 "@cached\|@ttl" src/resources/*.py
```

### 3. URI Pattern Validation

Validate URI consistency:

```markdown
# URI Pattern Standards

## Braiins OS MCP Server Example

✅ **Good URIs** (follows patterns):
```
braiins:///fleet/summary
braiins:///miner/{id}/status
braiins:///miner/{id}/config
braiins:///miner/{id}/logs
braiins:///jobs/{id}
```

❌ **Bad URIs** (inconsistent):
```
braiins://get-fleet        # Missing resource noun
braiins:///miner{id}       # Missing slashes
braiins:///status/miner-1  # Reversed hierarchy
braiins://miner/1/info     # Missing ///
```

## URI Pattern Rules

1. **Scheme**: Use project-specific scheme (e.g., `braiins://`)
2. **Path Separator**: Always use `///` after scheme
3. **Resource Hierarchy**: From general to specific
4. **Parameter Format**: Use `{param}` for variables
5. **Resource Names**: Plural for collections, singular for items
6. **No Query Strings**: Use path parameters, not `?key=value`

### 4. Caching Strategy Validation

```typescript
// Validate cache configuration
interface CacheValidation {
  resource: string;
  uri: string;
  hasCaching: boolean;
  ttl: number;
  volatility: 'high' | 'medium' | 'low';
  recommendedTTL: number;
  status: 'optimal' | 'too-short' | 'too-long' | 'missing';
}

const cacheValidations: CacheValidation[] = [
  {
    resource: 'fleet_summary',
    uri: 'braiins:///fleet/summary',
    hasCaching: true,
    ttl: 30, // seconds
    volatility: 'medium', // Fleet metrics change moderately
    recommendedTTL: 30-60,
    status: 'optimal'
  },
  {
    resource: 'miner_status',
    uri: 'braiins:///miner/{id}/status',
    hasCaching: true,
    ttl: 10, // seconds
    volatility: 'high', // Miner status changes frequently
    recommendedTTL: 5-15,
    status: 'optimal'
  },
  {
    resource: 'miner_config',
    uri: 'braiins:///miner/{id}/config',
    hasCaching: true,
    ttl: 60, // seconds
    volatility: 'low', // Config changes rarely
    recommendedTTL: 60-300,
    status: 'optimal'
  }
];

// Check cache implementation
for (const validation of cacheValidations) {
  if (!validation.hasCaching) {
    console.error(`❌ ${validation.resource}: No caching implemented`);
  } else if (validation.status === 'too-short') {
    console.warn(`⚠️  ${validation.resource}: TTL too short (${validation.ttl}s, recommend ${validation.recommendedTTL}s)`);
  } else if (validation.status === 'too-long') {
    console.warn(`⚠️  ${validation.resource}: TTL too long (${validation.ttl}s, recommend ${validation.recommendedTTL}s)`);
  } else {
    console.log(`✅ ${validation.resource}: Cache strategy optimal`);
  }
}
```

### 5. Cache Invalidation Validation

```bash
# Check for cache invalidation on writes
!grep -A 10 "cache.del\|cache.invalidate\|redis.del" src/

# Validate invalidation triggers
!grep -B 5 "cache.del" src/ | grep -E "update|delete|create"
```

### 6. Resource Schema Validation

Create validation script:

```typescript
// validate-mcp-resources.ts
import { ResourceValidator } from './validators';

interface ResourceSchema {
  uri: string;
  mimeType: string;
  expectedFields: string[];
  requiredFields: string[];
  optionalFields: string[];
}

const schemas: ResourceSchema[] = [
  {
    uri: 'braiins:///fleet/summary',
    mimeType: 'application/json',
    expectedFields: ['totalMiners', 'onlineMiners', 'totalHashrate', 'averageTemp', 'activeAlerts'],
    requiredFields: ['totalMiners', 'onlineMiners', 'totalHashrate'],
    optionalFields: ['averageTemp', 'activeAlerts']
  },
  {
    uri: 'braiins:///miner/{id}/status',
    mimeType: 'application/json',
    expectedFields: ['minerId', 'status', 'hashrate', 'temperature', 'uptime'],
    requiredFields: ['minerId', 'status'],
    optionalFields: ['hashrate', 'temperature', 'uptime']
  }
];

async function validateSchemas() {
  for (const schema of schemas) {
    const resource = await server.getResource(schema.uri);
    const data = JSON.parse(resource.contents[0].text);

    // Check required fields
    for (const field of schema.requiredFields) {
      if (!(field in data)) {
        console.error(`❌ ${schema.uri}: Missing required field '${field}'`);
      }
    }

    // Check unexpected fields
    for (const field of Object.keys(data)) {
      if (!schema.expectedFields.includes(field)) {
        console.warn(`⚠️  ${schema.uri}: Unexpected field '${field}'`);
      }
    }

    // Check MIME type
    if (resource.contents[0].mimeType !== schema.mimeType) {
      console.error(`❌ ${schema.uri}: Incorrect MIME type '${resource.contents[0].mimeType}'`);
    }
  }
}
```

### 7. Generate Validation Report

Create **MCP_RESOURCE_VALIDATION_RESULTS.md**:

```markdown
# MCP Resource Validation Results

**Report Generated**: [ISO 8601 timestamp]
**Project**: [Project Name]
**Resources Validated**: [N]

---

## 📊 Summary

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| Total Resources | [N] | N/A | ℹ️ |
| URI Valid | [N] | 100% | ✅ / ❌ |
| Cache Configured | [N] | 100% | ✅ / ⚠️ |
| Schema Valid | [N] | 100% | ✅ / ❌ |
| **Pass Rate** | **[X]%** | **100%** | **✅ / ❌** |

---

## ✅ Resources Passing All Validations

### Resource: braiins:///fleet/summary
**File**: src/mcp/resources/fleet-summary.ts
**Validations**: 6/6 passed
**URI**: ✅ Follows pattern
**Cache**: ✅ TTL 30s (optimal)
**Schema**: ✅ All fields present
**Invalidation**: ✅ On fleet changes

**Validation Results**:
- ✅ URI follows pattern
- ✅ Caching implemented with appropriate TTL
- ✅ Cache invalidated on data changes
- ✅ Schema matches specification
- ✅ MIME type correct (application/json)
- ✅ Required fields always present

---

## ❌ Resources Failing Validations

### Resource: braiins:///miner/{id}/logs
**File**: src/mcp/resources/miner-logs.ts
**Validations**: 3/6 passed
**Issues Found**: 3

**Failures**:
1. ❌ **No cache invalidation**
   - Cache: TTL 30s
   - Issue: Logs never invalidated even when new logs added
   - Impact: Agents see stale logs up to 30 seconds old
   - Fix: Invalidate cache on log write events

2. ❌ **Schema inconsistency**
   - Missing Field: `timestamp` field not always present
   - Impact: Agents can't reliably sort logs by time
   - Fix: Ensure all log entries have timestamp

3. ⚠️ **Cache TTL too long**
   - Current: 30s
   - Recommended: 10s (logs are high-volatility)
   - Impact: Agents may miss recent errors
   - Fix: Reduce TTL to 10s

---

## ⚠️ Warnings & Recommendations

### URI Patterns

**Inconsistencies Found**:
- ⚠️ Resource: `braiins://jobs-status/{id}` (should be `braiins:///jobs/{id}`)
- ⚠️ Resource: `braiins:///get-miner-config` (should use noun: `braiins:///miner/{id}/config`)

### Caching Strategies

**Suboptimal TTLs**:
| Resource | Current TTL | Volatility | Recommended | Issue |
|----------|------------|------------|-------------|-------|
| miner_logs | 30s | High | 10s | Too long |
| miner_config | 10s | Low | 60s | Too short (wasted queries) |

**Missing Cache Invalidation**:
- miner_logs (never invalidated)
- job_status (should invalidate on job completion)

### Schema Validation

**Missing Optional Fields**:
- fleet_summary: Missing `errorRate` field in some responses
- miner_status: `uptime` field not always present

**Inconsistent Field Types**:
- miner_status.hashrate: Sometimes number, sometimes string

---

## 📈 Resource Health Metrics

### Resources by Category

| Category | Count | Validations Pass | Status |
|----------|-------|-----------------|--------|
| **Fleet Monitoring** | 1 | 1/1 | ✅ 100% |
| **Miner Status** | 1 | 1/1 | ✅ 100% |
| **Miner Configuration** | 1 | 0/1 | ❌ 0% |
| **Miner Logs** | 1 | 0/1 | ❌ 0% |
| **Job Status** | 1 | 0/1 | ❌ 0% |

### Validation Coverage

| Validation Type | Pass Rate | Target | Status |
|----------------|-----------|--------|--------|
| **URI Patterns** | 80% | 100% | ⚠️ |
| **Caching** | 60% | 100% | ❌ |
| **Invalidation** | 40% | 100% | ❌ |
| **Schema** | 75% | 100% | ⚠️ |
| **MIME Types** | 100% | 100% | ✅ |

---

## 🎯 Recommendations

### Immediate Actions
1. ❌ [CRITICAL] Fix cache invalidation for miner_logs and job_status
2. ❌ [CRITICAL] Fix schema inconsistencies (missing timestamps)
3. ⚠️ [HIGH] Standardize URI patterns across all resources

### Short-Term Improvements
- Optimize cache TTLs based on data volatility
- Add schema validation in resource handlers
- Document expected schemas for all resources

### Long-Term Goals
- 100% cache invalidation coverage
- Consistent schema across all resources
- Automated schema validation in CI/CD

---

## 📋 Caching Best Practices

### TTL Guidelines by Data Volatility

| Volatility | Change Frequency | Recommended TTL | Examples |
|------------|------------------|-----------------|----------|
| **High** | < 30s | 5-15s | Miner status, real-time hashrate |
| **Medium** | 30s-5min | 30-60s | Fleet summary, aggregated metrics |
| **Low** | > 5min | 60-300s | Miner config, firmware info |
| **Static** | Rarely | 300-3600s | API documentation, schemas |

### Invalidation Patterns

**Event-Based Invalidation** (Preferred):
```typescript
// Invalidate when data changes
async function updateMinerConfig(minerId: string, config: Config) {
  await database.updateConfig(minerId, config);
  await cache.del(`miner:${minerId}:config`); // Invalidate immediately
}
```

**Time-Based Expiration** (Fallback):
```typescript
// Use TTL as safety net
await cache.set(`miner:${minerId}:status`, status, { ttl: 10 });
```

---

## 📞 Quick Actions

### Re-validate Specific Resource
```bash
npm test -- --testPathPattern="resources/miner-logs" --verbose
```

### Check Cache Hit Rate
```bash
redis-cli INFO stats | grep cache_hits
redis-cli INFO stats | grep cache_misses
```

### Monitor Cache Invalidations
```bash
redis-cli MONITOR | grep "DEL miner:"
```

---

**Next Steps**:
1. Fix all CRITICAL cache invalidation issues
2. Standardize URI patterns
3. Re-run `/validate-mcp-resources`
4. Verify all validations pass before deployment
```

### 8. Display Validation Summary

Show formatted output:

```
╔════════════════════════════════════════════════════╗
║     MCP RESOURCES VALIDATED SUCCESSFULLY           ║
╚════════════════════════════════════════════════════╝

PROJECT: [Project Name]
RESOURCES VALIDATED: [N]

SUMMARY:
  URI Patterns:      [N]/[N] ✅ / ❌
  Caching:           [N]/[N] ✅ / ❌
  Invalidation:      [N]/[N] ✅ / ❌
  Schema:            [N]/[N] ✅ / ❌
  MIME Types:        [N]/[N] ✅ / ❌

OVERALL: [N]/[N] resources passing ✅ / ❌

CRITICAL ISSUES: [N]
  [List critical failures]

WARNINGS: [N]
  [List warnings]

Full Report: MCP_RESOURCE_VALIDATION_RESULTS.md

NEXT STEPS:
  ✅ All resources valid - Ready for production
  ❌ Resources failing - Fix before deployment
  ⚠️ Warnings - Address before next release
```

## Quality Gates

- ✅ **URI Patterns**: 100% consistency required
- ✅ **Caching**: 100% implementation required
- ⚠️ **Cache Invalidation**: 90%+ event-based invalidation
- ✅ **Schema**: 100% consistency required
- ✅ **MIME Types**: 100% correct required

## Key Features

- **URI Validation**: Ensures consistent, predictable patterns
- **Cache Analysis**: Validates TTL appropriateness
- **Invalidation Checks**: Verifies cache freshness
- **Schema Validation**: Ensures data consistency
- **Best Practice Guidance**: Recommendations for optimization

## When to Use /validate-mcp-resources

- After implementing new MCP resources
- Before creating a PR with resource changes
- Before production deployment
- As part of CI/CD pipeline
- After refactoring resource implementations
- When debugging cache-related issues

## Related Commands

- `/test-mcp-tools` - Test MCP tools
- `/mcp-init` - Initialize new MCP server
- `/test-all` - Run full test suite
- `/mcp-dev-session` - Start MCP development session

## Skills Used

- `mcp-builder` (Phase 3: Review and Testing)
- `redis-caching-patterns` (Cache validation)

---

**Status**: ✅ Production Ready
**Version**: 1.0
**Maintained By**: MCP Development Team
