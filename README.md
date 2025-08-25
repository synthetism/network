# Network Unit

**Supercharged HTTP Client with Integrated Resilience Patterns**

The Network unit is a comprehensive HTTP client that orchestrates multiple resilience patterns into a unified, intelligent networking solution. It combines circuit breakers, retry logic, rate limiting, and proxy rotation into a single, easy-to-use interface.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Features](#core-features)
4. [Getting Started](#getting-started)
5. [Built-in Functions](#built-in-functions)
6. [Resilience Patterns](#resilience-patterns)
7. [Integration Guide](#integration-guide)
8. [Examples](#examples)
9. [Monitoring & Debugging](#monitoring--debugging)
10. [Best Practices](#best-practices)
11. [Contributing](#contributing)

## Overview

```typescript
import { Network } from '@synet/network';

// Simple usage
const network = Network.create({
  baseUrl: 'https://api.example.com',
  timeout: 10000
});

const result = await network.request('/users/123');
```

### Key Benefits

- **Automatic Retry** - Smart retry with exponential backoff
- **Circuit Breaker** - Fail-fast protection against cascading failures  
- **Rate Limiting** - Built-in request throttling
- **Proxy Rotation** - Automatic proxy failover and rotation
- **Monitoring** - Comprehensive statistics and health metrics

## Architecture

The Network unit follows **Unit Architecture** principles, orchestrating specialized units:

```
┌─────────────────┐
│   Network Unit  │  ← Main orchestrator
├─────────────────┤
│ Circuit Breaker │  ← Per-endpoint failure protection
│ Retry Logic     │  ← Exponential backoff retry
│ HTTP Client     │  ← Core HTTP operations
│ Rate Limiter    │  ← Request throttling (optional)
│ Proxy Pool      │  ← Proxy rotation (optional)
│ Logger          │  ← Debug logging (optional)
└─────────────────┘
```

## Core Features

### 1. Intelligent Request Orchestration

The Network unit coordinates multiple resilience patterns automatically:

```typescript
const network = Network.create({
  baseUrl: 'https://api.example.com',
  circuitBreaker: {
    failureThreshold: 5,
    timeout: 60000,
    monitoringPeriod: 120000
  },
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000
  }
});
```

### 2. Per-Endpoint Circuit Breakers

Each URL endpoint gets its own circuit breaker:

```typescript
// Each endpoint is independently monitored
await network.request('/users');      // Circuit breaker: /users
await network.request('/orders');     // Circuit breaker: /orders  
await network.request('/products');   // Circuit breaker: /products
```

### 3. Proxy Integration

Seamless integration with proxy pools:

```typescript
import { ProxyUnit, OculusSource } from '@synet/proxy';

const proxyUnit = ProxyUnit.create({
  sources: [new OculusSource(config)]
});

const network = Network.create({
  baseUrl: 'https://api.example.com',
  proxy: proxyUnit  // Automatic proxy rotation on failures
});
```

## Getting Started

### Installation

```bash
npm install @synet/network
```

### Basic Usage

```typescript
import { Network } from '@synet/network';

// 1. Create network unit
const network = Network.create({
  baseUrl: 'https://httpbin.org',
  timeout: 15000
});

// 2. Make requests
const result = await network.request('/ip');

if (result.response.ok) {
  console.log('Response:', result.parsed);
} else {
  console.error('Failed:', result.response.status);
}
```

### Configuration Options

```typescript
interface NetworkConfig {
  // HTTP Configuration
  baseUrl?: string;                    // Base URL for all requests
  timeout?: number;                    // Request timeout (ms)
  defaultHeaders?: Record<string, string>; // Default headers

  // Circuit Breaker Configuration  
  circuitBreaker?: {
    failureThreshold?: number;         // Failures before opening (default: 5)
    timeout?: number;                  // Time in open state (ms, default: 60000)
    monitoringPeriod?: number;         // Reset period (ms, default: 120000)
  };

  // Retry Configuration
  retry?: {
    maxAttempts?: number;              // Max retry attempts (default: 3)
    baseDelay?: number;                // Initial delay (ms, default: 1000)
    maxDelay?: number;                 // Max delay (ms, default: 10000)
    backoffFactor?: number;            // Exponential factor (default: 2)
  };

  // Optional Integrations
  rateLimiter?: RateLimiter;           // Rate limiting unit
  proxy?: ProxyUnit;                   // Proxy pool unit
  logger?: Logger;                     // Debug logging unit
}
```

## Built-in Functions

### Core Request Method

#### `request(url: string, options?: RequestOptions): Promise<RequestResult>`

Execute an HTTP request with full resilience orchestration.

```typescript
const result = await network.request('/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token'
  },
  body: JSON.stringify({ name: 'John Doe' }),
  timeout: 5000
});

// Result structure
interface RequestResult {
  response: HttpResponse;    // Full HTTP response
  parsed?: unknown;          // Auto-parsed JSON (if applicable)
  requestId: string;         // Unique request identifier
  timestamp: Date;           // Request timestamp
}
```

#### Request Options

```typescript
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | object;    // Auto-serialized if object
  timeout?: number;          // Override default timeout
}
```

### Statistics and Monitoring

#### `getStats(): Promise<NetworkStats>`

Get comprehensive statistics about network operations.

```typescript
const stats = await network.getStats();

console.log('Circuit Breakers:', stats.circuitBreakerCount);
console.log('Total Retries:', stats.retryStats.totalRetries);
console.log('Has Proxy:', stats.hasProxy);
console.log('Has Rate Limiter:', stats.hasRateLimiter);
```

#### Statistics Structure

```typescript
interface NetworkStats {
  circuitBreakerCount: number;         // Number of circuit breakers
  retryStats: RetryStats;              // Retry statistics
  hasProxy: boolean;                   // Proxy integration status
  hasRateLimiter: boolean;             // Rate limiter status
  proxyStats?: ProxyStats;             // Proxy pool statistics (if available)
  rateLimiterStats?: RateLimitStats;   // Rate limiter statistics (if available)
}
```

## Resilience Patterns

### 1. Circuit Breaker Pattern

**Purpose**: Prevent cascading failures by failing fast when a service is unhealthy.

#### How It Works

```typescript
// Healthy state: Requests pass through
await network.request('/healthy-service');  // ✅ Success

// Failures accumulate
await network.request('/failing-service');  // ❌ Failure 1
await network.request('/failing-service');  // ❌ Failure 2
await network.request('/failing-service');  // ❌ Failure 3
await network.request('/failing-service');  // ❌ Failure 4
await network.request('/failing-service');  // ❌ Failure 5

// Circuit opens: Fail fast
await network.request('/failing-service');  // ⚡ Circuit Open - Immediate failure

// After timeout: Half-open state
// First request acts as health check
await network.request('/failing-service');  // 🔍 Health check
```

#### Per-Endpoint Isolation

Each URL path gets its own circuit breaker:

```typescript
// Independent circuit breakers
await network.request('/users');      // Circuit: /users (healthy)
await network.request('/orders');     // Circuit: /orders (failing)
await network.request('/products');   // Circuit: /products (healthy)

// Only /orders endpoint is affected by circuit breaker
```

#### Configuration

```typescript
const network = Network.create({
  circuitBreaker: {
    failureThreshold: 3,     // Open after 3 failures
    timeout: 30000,          // Stay open for 30 seconds
    monitoringPeriod: 60000  // Reset counters every 60 seconds
  }
});
```

### 2. Retry Pattern

**Purpose**: Handle transient failures with intelligent backoff strategies.

#### Exponential Backoff

```typescript
// Request fails: Automatic retry sequence
// Attempt 1: Immediate (0ms delay)
// Attempt 2: 1000ms delay  
// Attempt 3: 2000ms delay
// Attempt 4: 4000ms delay (if maxAttempts allows)
```

#### Smart Retry Logic

```typescript
const network = Network.create({
  retry: {
    maxAttempts: 4,        // Total attempts (including initial)
    baseDelay: 1000,       // Starting delay
    maxDelay: 8000,        // Cap on delay
    backoffFactor: 2       // Exponential multiplier
  }
});

// Retry sequence:
// 1st attempt: immediate
// 2nd attempt: wait 1000ms  
// 3rd attempt: wait 2000ms
// 4th attempt: wait 4000ms
```

#### Retry Conditions

The Network unit automatically retries on:
- Network errors (ECONNREFUSED, ETIMEDOUT, etc.)
- HTTP 5xx server errors
- HTTP 429 (Rate Limited)
- Circuit breaker failures (with proxy rotation if available)

Does NOT retry on:
- HTTP 4xx client errors (except 429)
- Successful responses (2xx, 3xx)

### 3. Rate Limiting Integration

**Purpose**: Throttle outgoing requests to respect API limits.

#### AsyncRateLimiter Integration

```typescript
import { AsyncRateLimiter } from '@synet/rate-limiter';

const rateLimiter = AsyncRateLimiter.create({
  maxRequests: 100,
  windowMs: 60000  // 100 requests per minute
});

const network = Network.create({
  baseUrl: 'https://api.example.com',
  rateLimiter
});

// Automatic rate limiting
await network.request('/api/data');  // Waits if rate limit exceeded
```

#### Rate Limit Context

The rate limiter can use contextual information:

```typescript
// Rate limiting by endpoint
const context: RateLimitContext = {
  key: '/api/users',
  metadata: { 
    endpoint: '/api/users',
    priority: 'high' 
  }
};

// The Network unit automatically provides context
await network.request('/api/users');  // Uses '/api/users' as rate limit key
```

### 4. Proxy Rotation

**Purpose**: Distribute requests across proxy pools and handle proxy failures.

#### Automatic Proxy Integration

```typescript
import { ProxyUnit, OculusSource } from '@synet/proxy';

// 1. Create proxy pool
const proxyUnit = ProxyUnit.create({
  sources: [new OculusSource({
    apiToken: 'your-token',
    orderToken: 'your-order',
    planType: 'SHARED_DC'
  })]
});

// 2. Initialize proxy pool
await proxyUnit.init();

// 3. Create network with proxy integration
const network = Network.create({
  baseUrl: 'https://api.example.com',
  proxy: proxyUnit
});

// 4. Automatic proxy usage
await network.request('/data'); 
```

#### Proxy Rotation on Failures

```typescript
// Circuit breaker opens due to failures
await network.request('/api/data');  // Proxy A fails
await network.request('/api/data');  // Proxy A fails  
await network.request('/api/data');  // Proxy A fails (circuit opens)

// Network unit automatically:
// 1. Detects circuit breaker failure
// 2. Marks proxy as failed
// 3. Gets fresh proxy from pool
// 4. Retries with new proxy
await network.request('/api/data');  // Proxy B (fresh proxy)
```

#### Proxy Error Handling

The Network unit recognizes proxy-specific errors:

```typescript
// HTTP 407: Proxy Authentication Required
// HTTP 502: Bad Gateway (proxy)
// Network errors: ECONNREFUSED to proxy

// Automatic response:
// 1. Mark proxy as failed in pool
// 2. Get replacement proxy
// 3. Retry request with new proxy
// 4. If no proxies available, fail gracefully
```

## Integration Guide

### With Circuit Breaker

```typescript
// Manual circuit breaker configuration
const network = Network.create({
  circuitBreaker: {
    failureThreshold: 10,      // More tolerant
    timeout: 120000,           // 2 minute timeout
    monitoringPeriod: 300000   // 5 minute reset period
  }
});
```

### With Retry Logic

```typescript
// Conservative retry strategy
const network = Network.create({
  retry: {
    maxAttempts: 2,      // Only 1 retry
    baseDelay: 2000,     // Start with 2 second delay
    maxDelay: 30000,     // Cap at 30 seconds
    backoffFactor: 3     // Aggressive backoff
  }
});
```

### With Rate Limiter

```typescript
import { AsyncRateLimiter } from '@synet/rate-limiter';

// Create rate limiter with Redis backend
const rateLimiter = AsyncRateLimiter.create({
  maxRequests: 1000,
  windowMs: 3600000,  // 1000 requests per hour
  keyGenerator: (context) => `api:${context.key}`,
  // Optional Redis configuration for distributed rate limiting
});

const network = Network.create({
  baseUrl: 'https://api.example.com',
  rateLimiter
});
```

### With Proxy Pool

```typescript
import { ProxyUnit, ProxyMeshSource, OculusSource } from '@synet/proxy';

// Multiple proxy sources
const proxyUnit = ProxyUnit.create({
  sources: [
    new OculusSource(oculusConfig),
    new ProxyMeshSource(proxyMeshConfig),
    new CustomSource(customSourceConfig)
  ]
});

await proxyUnit.init();

const network = Network.create({
  baseUrl: 'https://api.example.com',
  proxy: proxyUnit,
  circuitBreaker: {
    failureThreshold: 3  // Faster proxy rotation
  }
});
```

### With Logger

```typescript
import { Logger } from '@synet/logger';

const logger = Logger.create({
  type: 'console',
  level: 'debug',
  format: 'json'
});

const network = Network.create({
  baseUrl: 'https://api.example.com',
  logger,
  proxy: proxyUnit
});

// Detailed logging of proxy rotation, circuit breaker state, etc.
```

## Examples

### Basic HTTP Client

```typescript
import { Network } from '@synet/network';

async function basicExample() {
  const network = Network.create({
    baseUrl: 'https://jsonplaceholder.typicode.com',
    timeout: 10000
  });

  // GET request
  const user = await network.request('/users/1');
  console.log('User:', user.parsed);

  // POST request
  const newPost = await network.request('/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      title: 'My Post',
      body: 'Post content',
      userId: 1
    }
  });

  console.log('Created post:', newPost.parsed);
}
```

### Resilient API Client

```typescript
import { Network } from '@synet/network';
import { AsyncRateLimiter } from '@synet/rate-limiter';

async function resilientExample() {
  // Rate limiter: 60 requests per minute
  const rateLimiter = AsyncRateLimiter.create({
    maxRequests: 60,
    windowMs: 60000
  });

  const network = Network.create({
    baseUrl: 'https://api.unreliable-service.com',
    timeout: 15000,
    
    // Aggressive circuit breaker
    circuitBreaker: {
      failureThreshold: 3,
      timeout: 30000,
      monitoringPeriod: 120000
    },
    
    // Conservative retry
    retry: {
      maxAttempts: 5,
      baseDelay: 2000,
      maxDelay: 30000
    },
    
    rateLimiter
  });

  try {
    const result = await network.request('/critical-data');
    return result.parsed;
  } catch (error) {
    console.error('Failed after all resilience attempts:', error);
    throw error;
  }
}
```

### Proxy-Enabled Scraping

```typescript
import { Network } from '@synet/network';
import { ProxyUnit, OculusSource } from '@synet/proxy';

async function scrapingExample() {
  // Create proxy pool
  const proxyUnit = ProxyUnit.create({
    sources: [new OculusSource({
      apiToken: process.env.OCULUS_API_TOKEN!,
      orderToken: process.env.OCULUS_ORDER_TOKEN!,
      planType: 'SHARED_DC',
      country: 'US'
    })]
  });

  await proxyUnit.init();

  const network = Network.create({
    timeout: 30000,
    proxy: proxyUnit,
    
    // Fast proxy rotation on failures
    circuitBreaker: {
      failureThreshold: 2,
      timeout: 10000
    },
    
    retry: {
      maxAttempts: 3,
      baseDelay: 1000
    }
  });

  const urls = [
    'https://httpbin.org/ip',
    'https://api.ipify.org?format=json',
    'https://icanhazip.com'
  ];

  for (const url of urls) {
    try {
      const result = await network.request(url);
      console.log(`${url}: ${JSON.stringify(result.parsed)}`);
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
    }
  }

  // Show proxy usage statistics
  const stats = await network.getStats();
  console.log('Proxy pool stats:', stats.proxyStats);
}
```

### Error Handling Patterns

```typescript
import { Network } from '@synet/network';

async function errorHandlingExample() {
  const network = Network.create({
    baseUrl: 'https://api.example.com'
  });

  try {
    const result = await network.request('/data');
    
    // Check response status
    if (result.response.ok) {
      console.log('Success:', result.parsed);
    } else {
      console.error('HTTP Error:', result.response.status, result.response.statusText);
    }
    
  } catch (error) {
    // Network-level errors (circuit breaker, all retries failed, etc.)
    console.error('Network Error:', error.message);
    
    // Get network statistics for debugging
    const stats = await network.getStats();
    console.log('Network stats:', stats);
  }
}
```

## Monitoring & Debugging

### Statistics Collection

```typescript
const stats = await network.getStats();

console.log('Network Statistics:');
console.log('Circuit Breakers:', stats.circuitBreakerCount);
console.log('Retry Stats:', {
  totalRetries: stats.retryStats.totalRetries,
  successfulRetries: stats.retryStats.successfulRetries,
  failedRetries: stats.retryStats.failedRetries
});

if (stats.hasProxy && stats.proxyStats) {
  console.log('Proxy Stats:', {
    poolSize: stats.proxyStats.currentSize,
    available: stats.proxyStats.available,
    initialized: stats.proxyStats.initialized
  });
}

if (stats.hasRateLimiter && stats.rateLimiterStats) {
  console.log('Rate Limiter Stats:', stats.rateLimiterStats);
}
```

### Circuit Breaker Monitoring

```typescript
// Access individual circuit breaker stats
const circuitBreakers = network.props.circuitBreakers;

for (const [url, breaker] of circuitBreakers) {
  const stats = breaker.getStats();
  console.log(`Circuit Breaker for ${url}:`, {
    state: stats.state,
    failures: stats.failures,
    successes: stats.successes,
    lastFailureTime: stats.lastFailureTime
  });
}
```

### Debug Logging

```typescript
import { Logger } from '@synet/logger';

const logger = Logger.create({
  level: 'debug',
  format: 'pretty'
});

const network = Network.create({
  baseUrl: 'https://api.example.com',
  logger,
  proxy: proxyUnit
});

// Detailed logs for:
// - Circuit breaker state changes
// - Retry attempts and backoff
// - Proxy rotation events
// - Rate limiting decisions
```

### Request Tracing

```typescript
const result = await network.request('/api/data');

console.log('Request Trace:');
console.log('Request ID:', result.requestId);
console.log('Timestamp:', result.timestamp);
console.log('Duration:', result.response.duration, 'ms');
console.log('Status:', result.response.status);
```

## Best Practices

### 1. Configuration Guidelines

```typescript
// Production configuration
const network = Network.create({
  // Conservative timeouts
  timeout: 30000,
  
  // Balanced circuit breaker
  circuitBreaker: {
    failureThreshold: 5,      // Allow some failures
    timeout: 60000,           // 1 minute recovery time
    monitoringPeriod: 300000  // 5 minute reset window
  },
  
  // Exponential backoff with jitter
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  }
});
```

### 2. Error Handling

```typescript
async function robustRequest(network: Network, url: string) {
  try {
    const result = await network.request(url);
    
    if (!result.response.ok) {
      throw new Error(`HTTP ${result.response.status}: ${result.response.statusText}`);
    }
    
    return result.parsed;
    
  } catch (error) {
    // Log error with context
    console.error('Request failed:', {
      url,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    // Get network stats for debugging
    const stats = await network.getStats();
    console.error('Network state:', stats);
    
    throw error;
  }
}
```

### 3. Proxy Pool Management

```typescript
// Initialize proxy pool with error handling
async function initializeNetwork() {
  const proxyUnit = ProxyUnit.create({
    sources: [new OculusSource(config)]
  });

  try {
    await proxyUnit.init();
    console.log('Proxy pool initialized:', proxyUnit.getStats());
  } catch (error) {
    console.error('Failed to initialize proxy pool:', error);
    // Continue without proxy or throw based on requirements
  }

  return Network.create({
    baseUrl: 'https://api.example.com',
    proxy: proxyUnit
  });
}
```

### 4. Rate Limiting Strategy

```typescript
// API-specific rate limiting
const rateLimiter = AsyncRateLimiter.create({
  maxRequests: 100,
  windowMs: 60000,
  keyGenerator: (context) => {
    // Different limits for different endpoints
    if (context.key.includes('/search')) {
      return `search:${context.metadata?.userId}`;
    }
    return `api:${context.key}`;
  }
});
```

### 5. Testing Strategies

```typescript
// Mock network for testing
const mockNetwork = Network.create({
  baseUrl: 'http://localhost:3000',  // Test server
  circuitBreaker: {
    failureThreshold: 2,  // Faster testing
    timeout: 1000
  },
  retry: {
    maxAttempts: 2,
    baseDelay: 100  // Faster tests
  }
});

// Test circuit breaker behavior
test('circuit breaker opens after failures', async () => {
  // Trigger failures
  await expect(mockNetwork.request('/fail')).rejects.toThrow();
  await expect(mockNetwork.request('/fail')).rejects.toThrow();
  
  // Circuit should be open now
  const stats = await mockNetwork.getStats();
  expect(stats.circuitBreakerCount).toBeGreaterThan(0);
});
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed contribution guidelines.

### Quick Start

```bash
# Clone and install
git clone <repository>
cd packages/network
npm install

# Run tests
npm test

# Run demos
npm run demo
npm run demo:retry
npm run demo:proxy
```

### Development Commands

```bash
npm run build        # Build TypeScript
npm run test         # Run test suite
npm run dev:test     # Watch mode testing
npm run lint         # Check code style
npm run lint:fix     # Fix code style
npm run coverage     # Generate coverage report
```

## API Reference

### Types

```typescript
interface NetworkConfig {
  baseUrl?: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  retry?: Partial<RetryConfig>;
  rateLimiter?: RateLimiter;
  proxy?: ProxyUnit;
  logger?: Logger;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | object;
  timeout?: number;
}

interface RequestResult {
  response: HttpResponse;
  parsed?: unknown;
  requestId: string;
  timestamp: Date;
}

interface NetworkStats {
  circuitBreakerCount: number;
  retryStats: RetryStats;
  hasProxy: boolean;
  hasRateLimiter: boolean;
  proxyStats?: ProxyStats;
  rateLimiterStats?: RateLimitStats;
}
```
