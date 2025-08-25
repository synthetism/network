# Contributing to Network Unit

Welcome to the Network unit development! This guide will help you understand the architecture, development workflow, and contribution standards.

## Table of Contents

1. [Overview](#overview)
2. [Development Setup](#development-setup)
3. [Architecture](#architecture)
4. [Unit Architecture Compliance](#unit-architecture-compliance)
5. [Testing](#testing)
6. [Code Standards](#code-standards)
7. [Debugging](#debugging)
8. [Adding Features](#adding-features)
9. [Documentation](#documentation)
10. [Release Process](#release-process)

## Overview

The Network unit is a **HTTP client** that orchestrates multiple resilience patterns:

- **Circuit Breaker**: Per-endpoint failure protection
- **Retry Logic**: Exponential backoff with jitter
- **Rate Limiting**: Request throttling integration
- **Proxy Rotation**: Automatic proxy failover
- **Monitoring**: Comprehensive statistics

### Key Principles

1. **Consciousness First**: Full Unit Architecture v1.1.1 compliance
2. **Resilience by Design**: All requests go through resilience patterns
3. **Zero Configuration**: Sensible defaults, optional customization
4. **Integration Ready**: Designed to work with other SYNET units

## Development Setup

### Prerequisites

```bash
node >= 18.0.0
npm >= 8.0.0
```

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd packages/network

# Install dependencies
npm install

# Build the project
npm run build
```

### Development Commands

```bash
# Development
npm run build         # Compile TypeScript
npm run dev:test      # Watch mode testing
npm run lint          # Code linting
npm run lint:fix      # Auto-fix linting issues

# Testing
npm test              # Run all tests
npm run coverage      # Generate coverage report
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only

# Demos
npm run demo          # Basic network demo
npm run demo:retry    # Retry pattern demo
npm run demo:proxy    # Proxy integration demo

# Quality
npm run format        # Code formatting
npm run type-check    # TypeScript checking
npm run prepublishOnly # Pre-publish validation
```

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Network Unit                             │
├─────────────────────────────────────────────────────────────┤
│  Consciousness Trinity:                                     │
│  ├── Capabilities (request, getStats)                      │
│  ├── Schema (parameter/response definitions)               │
│  └── Validator (input/output validation)                   │
├─────────────────────────────────────────────────────────────┤
│  Internal Units:                                           │
│  ├── HTTP Unit (@synet/http)                              │
│  ├── Circuit Breaker (@synet/circuit-breaker)             │
│  ├── Retry Unit (@synet/retry)                            │
│  └── Optional: Rate Limiter, Proxy Pool, Logger          │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow

```
1. network.request(url, options)
2. ├── Rate Limiter (if configured)
3. ├── Circuit Breaker Check
4. ├── HTTP Request via HTTP Unit
5. ├── Proxy Integration (if configured)
6. ├── Retry on Failure (if configured)
7. └── Return RequestResult
```

### File Structure

```
src/
├── network.unit.ts      # Main Network unit implementation
├── index.ts             # Public exports
└── types.ts             # TypeScript interfaces

test/
├── unit/                # Unit tests
├── integration/         # Integration tests
└── fixtures/            # Test data

demo/
├── github-demo.ts       # Basic usage demo
├── network-retry-demo.ts # Retry pattern demo
├── network-proxy.ts     # Proxy integration demo
└── simple-network-test.ts # Simple test demo
```

## Unit Architecture Compliance

The Network unit follows **SYNET Unit Architecture v1.1.1**. Here are the key compliance requirements:

### 1. Core Architecture (Doctrines 1-11)

#### ✅ ZERO DEPENDENCY
```typescript
// ✅ Good: Only @synet/* dependencies
import { Unit } from '@synet/unit';
import { CircuitBreaker } from '@synet/circuit-breaker';

// ❌ Bad: External dependencies in core unit
import axios from 'axios';  // Should be in @synet/http
```

#### ✅ TEACH/LEARN PARADIGM
```typescript
// Every unit must implement consciousness transfer
teach(): TeachingContract {
  return {
    unitId: this.dna.id,
    capabilities: this._unit.capabilities,
    schema: this._unit.schema,
    validator: this._unit.validator
  };
}
```

#### ✅ PROPS CONTAIN EVERYTHING
```typescript
// ✅ Good: Single source of truth via props
interface NetworkProps extends UnitProps {
  circuitBreakers: Map<string, CircuitBreaker>;
  retryUnit: Retry;
  httpUnit: Http;
  // ...
}

// ❌ Bad: Private field duplication
private _httpClient: Http;  // Duplicates props.httpUnit
```

#### ✅ CREATE NOT CONSTRUCT
```typescript
// ✅ Good: Protected constructor + static create
protected constructor(props: NetworkProps) {
  super(props);
}

static create(config: NetworkConfig): Network {
  // Factory implementation
}

// ❌ Bad: Public constructor
public constructor() {}  // Never allowed
```

### 2. Consciousness Trinity (Doctrines 23-27)

#### ✅ CONSCIOUSNESS TRINITY PATTERN
```typescript
protected build(): UnitCore {
  const capabilities = Capabilities.create(this.dna.id, {
    request: (...args: unknown[]) => this.request(args[0] as string, args[1] as RequestOptions),
    getStats: async (...args: unknown[]) => await this.getStats()
  });

  const schema = Schema.create(this.dna.id, {
    request: { /* detailed schema */ },
    getStats: { /* detailed schema */ }
  });

  const validator = Validator.create({
    unitId: this.dna.id,
    capabilities,
    schema,
    strictMode: false
  });

  return { capabilities, schema, validator };
}
```

#### ✅ TOOL UNIT PATTERN
Network is a **Tool Unit** (not Orchestrator), so it has rich schemas:

```typescript
// ✅ Good: Detailed schemas for teaching
const schema = Schema.create(this.dna.id, {
  request: {
    name: 'request',
    description: 'Execute HTTP request with resilience',
    parameters: { /* detailed parameter schema */ },
    response: { /* detailed response schema */ }
  }
});

// ❌ Bad: Empty schema (only for AI Orchestrator units)
const schema = Schema.create(this.dna.id, {});
```

### 3. Error Handling (Doctrines 14-16)

#### Two-Pattern Approach

**Simple Operations**: Exception-based
```typescript
// Unit creation, validation, impossible states
static create(config: NetworkConfig): Network {
  if (!config.baseUrl && !config.proxy) {
    throw new Error('[network] Must provide either baseUrl or proxy configuration');
  }
}
```

**Complex Operations**: Result pattern
```typescript
// HTTP requests, external dependencies
async request(url: string, options?: RequestOptions): Promise<RequestResult> {
  // Returns RequestResult with response.ok check, not exceptions
}
```

#### Enhanced Error Messages
```typescript
throw new Error(`
[${this.dna.id}] Cannot execute request without valid configuration

Available capabilities: ${this.capabilities().list().join(', ')}
Required: Valid baseUrl or proxy unit

Resolution:
  const network = Network.create({
    baseUrl: 'https://api.example.com'
  });
  
Context: ${context}
`);
```

## Testing

### Test Structure

```typescript
// Unit tests focus on individual capabilities
describe('Network Unit', () => {
  describe('request capability', () => {
    it('should execute HTTP requests with circuit breaker protection', async () => {
      const network = Network.create({
        baseUrl: 'https://httpbin.org'
      });
      
      const result = await network.request('/ip');
      
      expect(result.response.ok).toBe(true);
      expect(result.requestId).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });
});
```

### Testing Patterns

#### 1. Unit Testing
```bash
npm run test:unit
```

Test individual methods and consciousness trinity:

```typescript
test('consciousness trinity implementation', () => {
  const network = Network.create({ baseUrl: 'https://api.test' });
  
  expect(network.capabilities().list()).toContain('request');
  expect(network.schema().size()).toBeGreaterThan(0);
  expect(network.can('request')).toBe(true);
});
```

#### 2. Integration Testing
```bash
npm run test:integration
```

Test interactions with other units:

```typescript
test('proxy integration', async () => {
  const proxyUnit = createMockProxyUnit();
  const network = Network.create({
    baseUrl: 'https://httpbin.org',
    proxy: proxyUnit
  });
  
  const result = await network.request('/ip');
  expect(proxyUnit.get).toHaveBeenCalled();
});
```

#### 3. Demo Testing
```bash
npm run demo
```

Manual testing with real services:

```typescript
// demo/network-demo.ts
async function demonstrateRetryPattern() {
  const network = Network.create({
    baseUrl: 'https://httpbin.org',
    retry: { maxAttempts: 3 }
  });
  
  // Test with failing endpoint to show retry behavior
  const result = await network.request('/status/500');
  console.log('Retry behavior:', result);
}
```

### Mock Strategies

#### Mock External Units
```typescript
const mockProxyUnit = {
  get: jest.fn().mockResolvedValue(mockProxyConnection),
  failed: jest.fn(),
  getStats: jest.fn().mockReturnValue(mockStats)
} as jest.Mocked<ProxyUnit>;
```

#### Mock HTTP Responses
```typescript
// Use test server or httpbin.org for integration tests
const testBaseUrl = process.env.CI ? 'https://httpbin.org' : 'http://localhost:3001';
```

## Code Standards

### TypeScript Guidelines

#### Strict Type Safety
```typescript
// ✅ Good: Proper typing
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | object;
  timeout?: number;
}

// ❌ Bad: Any types
function request(options: any): any {}
```

#### Interface Naming
```typescript
// ✅ Good: Consistent naming pattern
interface NetworkConfig    // External input to static create()
interface NetworkProps     // Internal state after validation
interface RequestOptions   // Method parameters
interface RequestResult    // Method return type
```

### Code Organization

#### Method Organization
```typescript
class Network extends Unit<NetworkProps> {
  // 1. Constructor (protected)
  protected constructor(props: NetworkProps) {}
  
  // 2. Unit Architecture methods
  protected build(): UnitCore {}
  static create(config: NetworkConfig): Network {}
  
  // 3. Core capabilities
  async request(url: string, options?: RequestOptions): Promise<RequestResult> {}
  async getStats(): Promise<NetworkStats> {}
  
  // 4. Consciousness methods
  teach(): TeachingContract {}
  whoami(): string {}
  
  // 5. Private utilities (last)
  private buildRequestConfig(): RequestConfig {}
  private executeWithCircuitBreaker(): Promise<RequestResult> {}
}
```

#### Import Organization
```typescript
// 1. Node.js built-ins
import { readFileSync } from 'node:fs';

// 2. External dependencies (none for core units)

// 3. SYNET units
import { Unit, type UnitProps } from '@synet/unit';
import { CircuitBreaker } from '@synet/circuit-breaker';

// 4. Local imports
import type { RequestOptions } from './types.js';
```

### Documentation Standards

#### Method Documentation
```typescript
/**
 * Execute HTTP request with integrated resilience patterns
 * 
 * Features:
 * - Automatic circuit breaker protection per endpoint
 * - Exponential backoff retry on transient failures
 * - Optional rate limiting and proxy rotation
 * - Comprehensive monitoring and statistics
 * 
 * @param url - Request URL (absolute or relative to baseUrl)
 * @param options - Request configuration (method, headers, body, timeout)
 * @returns Promise<RequestResult> with response, parsed data, and metadata
 * 
 * @example
 * ```typescript
 * const result = await network.request('/api/users', {
 *   method: 'POST',
 *   body: { name: 'John Doe' }
 * });
 * 
 * if (result.response.ok) {
 *   console.log('User created:', result.parsed);
 * }
 * ```
 */
async request(url: string, options?: RequestOptions): Promise<RequestResult> {}
```

## Debugging

### Debug Logging

The Network unit supports debug logging through Logger integration:

```typescript
import { Logger } from '@synet/logger';

const logger = Logger.create({
  level: 'debug',
  format: 'pretty'
});

const network = Network.create({
  baseUrl: 'https://api.example.com',
  logger
});

// Logs circuit breaker state changes, proxy rotation, retry attempts
```

### Statistics for Debugging

```typescript
// Get comprehensive debugging information
const stats = await network.getStats();

console.log('Debug Info:', {
  circuitBreakers: stats.circuitBreakerCount,
  retryStats: stats.retryStats,
  proxyStats: stats.proxyStats,
  rateLimiterStats: stats.rateLimiterStats
});
```

### Manual Circuit Breaker Inspection

```typescript
// Access internal circuit breakers for debugging
const circuitBreakers = network.props.circuitBreakers;

for (const [endpoint, breaker] of circuitBreakers) {
  console.log(`Circuit Breaker ${endpoint}:`, breaker.getStats());
}
```

## Adding Features

### Adding New Capabilities

1. **Add to Capabilities**:
```typescript
const capabilities = Capabilities.create(this.dna.id, {
  request: (...args: unknown[]) => this.request(args[0] as string, args[1] as RequestOptions),
  getStats: async (...args: unknown[]) => await this.getStats(),
  // New capability
  newCapability: (...args: unknown[]) => this.newMethod(args[0] as ParamType)
});
```

2. **Add to Schema**:
```typescript
const schema = Schema.create(this.dna.id, {
  request: { /* existing schema */ },
  getStats: { /* existing schema */ },
  // New capability schema
  newCapability: {
    name: 'newCapability',
    description: 'Description of new capability',
    parameters: { /* parameter schema */ },
    response: { /* response schema */ }
  }
});
```

3. **Implement Method**:
```typescript
async newMethod(param: ParamType): Promise<ReturnType> {
  // Implementation
}
```

4. **Add Tests**:
```typescript
test('new capability', async () => {
  const network = Network.create({ baseUrl: 'https://test.com' });
  const result = await network.newMethod(testParam);
  expect(result).toBeDefined();
});
```

### Adding Integration Points

Example: Adding cache integration

1. **Update Config Interface**:
```typescript
interface NetworkConfig {
  // existing config...
  cache?: CacheUnit;  // New optional integration
}
```

2. **Update Props Interface**:
```typescript
interface NetworkProps extends UnitProps {
  // existing props...
  cache?: CacheUnit;
}
```

3. **Update Factory Method**:
```typescript
static create(config: NetworkConfig): Network {
  const props: NetworkProps = {
    // existing props...
    cache: config.cache
  };
  
  return new Network(props);
}
```

4. **Integrate in Request Logic**:
```typescript
async request(url: string, options?: RequestOptions): Promise<RequestResult> {
  // Check cache first
  if (this.props.cache && isGetRequest(options)) {
    const cached = await this.props.cache.get(url);
    if (cached) return cached;
  }
  
  // Execute request...
  const result = await this.executeRequest(url, options);
  
  // Cache successful responses
  if (this.props.cache && result.response.ok) {
    await this.props.cache.set(url, result);
  }
  
  return result;
}
```

## Documentation

### README Updates

When adding features, update the main README.md:

1. **Add to feature list**
2. **Add configuration options**
3. **Add usage examples**
4. **Update API reference**

### Code Comments

```typescript
// ✅ Good: Explain complex logic
// Circuit breaker state transitions:
// CLOSED -> OPEN (on failure threshold)
// OPEN -> HALF_OPEN (after timeout)
// HALF_OPEN -> CLOSED (on success) or OPEN (on failure)

// ❌ Bad: Obvious comments
const result = request.result;  // Get the result
```

### Demo Updates

Add demos for new features:

```typescript
// demo/new-feature-demo.ts
async function demonstrateNewFeature() {
  const network = Network.create({
    baseUrl: 'https://api.example.com',
    newFeature: true
  });
  
  console.log('Demonstrating new feature...');
  // Demo implementation
}
```

## Release Process

### Version Management

```bash
# Development version
npm run version:dev      # Bumps to x.x.x-dev.x

# Production versions
npm run version:patch    # Bug fixes (1.0.0 -> 1.0.1)
npm run version:minor    # New features (1.0.0 -> 1.1.0)
npm run version:major    # Breaking changes (1.0.0 -> 2.0.0)
```

### Pre-Release Checklist

1. **Code Quality**:
```bash
npm run lint:fix
npm run format
npm run type-check
```

2. **Testing**:
```bash
npm test
npm run coverage  # Ensure >90% coverage
npm run demo      # Manual testing
```

3. **Documentation**:
- [ ] README.md updated
- [ ] CONTRIBUTING.md updated (if needed)
- [ ] API changes documented
- [ ] Examples updated

4. **Build**:
```bash
npm run build
npm run prepublishOnly  # Runs all checks
```

### Publishing

```bash
# Development release
npm run release:dev

# Production release
npm run release:patch   # or minor/major
```

## Common Patterns

### Error Boundaries

```typescript
// Graceful degradation when optional units fail
try {
  if (this.props.rateLimiter) {
    await this.props.rateLimiter.acquire(context);
  }
} catch (error) {
  // Log but don't fail the request
  this.props.logger?.warn('Rate limiter failed:', error);
}
```

### Resource Cleanup

```typescript
// Clean up resources in destructors (if needed)
async cleanup(): Promise<void> {
  // Close circuit breakers
  for (const breaker of this.props.circuitBreakers.values()) {
    await breaker.close();
  }
  
  // Cleanup internal units
  await this.props.httpUnit.cleanup?.();
}
```

### State Management

```typescript
// Immutable state updates
private updateCircuitBreaker(endpoint: string, breaker: CircuitBreaker): Network {
  const newCircuitBreakers = new Map(this.props.circuitBreakers);
  newCircuitBreakers.set(endpoint, breaker);
  
  const newProps: NetworkProps = {
    ...this.props,
    circuitBreakers: newCircuitBreakers
  };
  
  return new Network(newProps);  // Return new instance
}
```

---

## Quick Reference

### Essential Commands
```bash
npm test                 # Run tests
npm run demo            # Run basic demo
npm run lint:fix        # Fix code style
npm run build           # Build project
```

### Key Files
- `src/network.unit.ts` - Main implementation
- `test/` - Unit tests
- `demo/` - Usage examples
- `README.md` - User documentation

If you have any questions, email me to anton@synthetism.ai

**Thank you!**
