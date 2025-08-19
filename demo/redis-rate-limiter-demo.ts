#!/usr/bin/env node

/**
 * SYNET Network Unit - Redis Rate Limiter Demo
 * 
 * Demonstrates:
 * - Network unit with Redis-backed rate limiter
 * - Distributed rate limiting across instances
 * - Redis adapter integration with KV system
 * - Circuit breaker + Redis rate limiter composition
 */

import { Network } from '../src/index.js';
import { RateLimiter, StorageBinding } from '@synet/rate-limiter';
import { KeyValue } from '@synet/kv';
import { RedisAdapter } from '@synet/kv-redis';

// Demo result type
interface DemoResult {
  id: number;
  success: boolean;
  duration: number;
  status?: number;
  error?: string;
}

// Redis Storage binding for distributed rate limiter
class RedisStorageBinding implements StorageBinding {
  constructor(private kv: any) {}

  async get<T>(key: string): Promise<T | null> {
    const result = await this.kv.get(key);
    return result || null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.kv.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return await this.kv.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return await this.kv.exists(key);
  }

  async clear(): Promise<void> {
    if (this.kv.clear) {
      await this.kv.clear();
    }
  }
}

async function main() {
  console.log('🔗 SYNET Network Redis Rate Limiter Demo\n');

  try {
    // 1. Create Redis adapter (with fallback for demo)
    console.log('1️⃣ Setting up Redis adapter...');
    let adapter: RedisAdapter;
    let redisAvailable = false;
    
    try {
      adapter = new RedisAdapter({
        host: 'localhost',
        port: 6379,
        keyPrefix: 'synet:network:demo:',
        defaultTTL: 60000, // 1 minute
        connectionTimeout: 2000, // Quick timeout for demo
        maxRetriesPerRequest: 1
      });
      
      // Test Redis connection
      await adapter.ping();
      redisAvailable = true;
      console.log('✅ Redis connected successfully!');
      
    } catch (error) {
      console.log('⚠️  Redis not available, falling back to memory adapter');
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fallback to memory adapter
      const { MemoryAdapter } = await import('@synet/kv');
      adapter = new MemoryAdapter() as any;
    }

    // 2. Create KV with adapter
    console.log('2️⃣ Creating KV storage...');
    const kv = KeyValue.create({ 
      adapter,
      namespace: 'rate-limiter' 
    });
    
    const storage = new RedisStorageBinding(kv);

    // 3. Create distributed rate limiter
    console.log('3️⃣ Creating distributed rate limiter...');
    const rateLimiter = RateLimiter.create({
      requests: 5,    // 5 requests
      window: 10000,  // per 10 seconds  
      burst: 2,       // +2 burst capacity
      storage         // Redis-backed storage
    });

    console.log('📊 Rate Limiter Configuration:');
    console.log(`- Storage: ${redisAvailable ? 'Redis (distributed)' : 'Memory (local)'}`);
    console.log(`- Limits: ${rateLimiter.whoami()}`);
    console.log('');

    // 4. Create Network with Redis rate limiter
    console.log('4️⃣ Creating network with Redis rate limiter...');
    const network = Network.create({
      baseUrl: 'https://httpbin.org',
      timeout: 5000,
      retry: {
        maxAttempts: 2,
        baseDelay: 500,
        jitter: true
      },
      circuitBreaker: {
        failureThreshold: 3,
        timeoutMs: 8000,
        halfOpenSuccessThreshold: 1
      },
      rateLimiter // Redis-backed rate limiter
    });

    console.log('🌐 Network Unit Created:');
    console.log(`- Identity: ${network.whoami()}`);
    console.log(`- Storage Type: ${redisAvailable ? 'Distributed Redis' : 'Local Memory'}`);
    console.log('');

    // 5. Test distributed rate limiting behavior
    console.log('🚀 Testing Distributed Rate Limiting (7 requests):');
    console.log('Expected: 5 + 2 burst = 7 total capacity, then rate limiting\n');
    
    const requests: Promise<DemoResult>[] = [];
    
    for (let i = 1; i <= 8; i++) {
      console.log(`--- Request ${i} ---`);
      const startTime = Date.now();
      
      const promise = network.request('/delay/1', {
        method: 'GET'
      }).then(result => {
        const duration = Date.now() - startTime;
        const isSuccess = result.response.status >= 200 && result.response.status < 300;
        if (isSuccess) {
          console.log(`✅ Request ${i}: Success (${duration}ms) - Status: ${result.response.status}`);
          return { id: i, success: true, duration, status: result.response.status };
        } else {
          console.log(`❌ Request ${i}: Failed (${duration}ms) - Status: ${result.response.status}`);
          return { id: i, success: false, duration, status: result.response.status };
        }
      }).catch(error => {
        const duration = Date.now() - startTime;
        console.log(`💥 Request ${i}: Rate Limited (${duration}ms) - ${error.message}`);
        return { id: i, success: false, duration, error: error.message };
      });
      
      requests.push(promise);
      
      // Small delay between requests to see timing
      if (i < 8) await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Wait for all requests
    console.log('\n⏳ Waiting for all requests to complete...\n');
    const results = await Promise.all(requests);

    // Analyze results
    console.log('📈 Results Analysis:');
    const successful = results.filter(r => r.success);
    const rateLimited = results.filter(r => !r.success && r.error?.includes('Rate limit'));
    
    console.log(`✅ Successful: ${successful.length}`);
    console.log(`🚫 Rate Limited: ${rateLimited.length}`);
    console.log(`❌ Other Failures: ${results.length - successful.length - rateLimited.length}`);
    console.log('');

    // Show detailed results
    results.forEach(result => {
      const status = result.success ? '✅' : '💥';
      const error = result.error ? ` (Rate Limited)` : '';
      console.log(`${status} Request ${result.id}: ${result.duration}ms${error}`);
    });

    // 6. Show network and rate limiter statistics
    console.log('\n📊 Network Statistics:');
    const stats = await network.getStats();
    console.log(`- Circuit Breakers: ${stats.circuitBreakerCount}`);
    console.log(`- Rate Limiter Active: ${stats.hasRateLimiter ? 'Yes' : 'No'}`);
    console.log(`- Storage Backend: ${redisAvailable ? 'Redis (Distributed)' : 'Memory (Local)'}`);
    
    if (stats.rateLimitStats) {
      console.log('\n🎯 Rate Limiter Stats:');
      console.log(JSON.stringify(stats.rateLimitStats, null, 2));
    }

    // 7. Test recovery after window expires
    console.log('\n🕐 Testing Rate Limit Recovery (waiting 3 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Making recovery request...');
    try {
      const recoveryResult = await network.request('/delay/1', { method: 'GET' });
      const isSuccess = recoveryResult.response.status >= 200 && recoveryResult.response.status < 300;
      console.log(`✅ Recovery: ${isSuccess ? 'SUCCESS' : 'FAILED'} - Status: ${recoveryResult.response.status}`);
    } catch (error) {
      console.log(`💥 Recovery: FAILED - ${error instanceof Error ? error.message : String(error)}`);
    }

    // 8. Clean up Redis connection if used
    if (redisAvailable && 'disconnect' in adapter) {
      console.log('\n🔌 Disconnecting from Redis...');
      await (adapter as any).disconnect();
      console.log('✅ Redis disconnected');
    }

    console.log('\n🎉 Redis Rate Limiter Demo Complete!');
    
    if (redisAvailable) {
      console.log('\n💡 Key Benefits of Redis-backed Rate Limiter:');
      console.log('1. Distributed state across multiple instances');
      console.log('2. Persistent rate limits survive restarts');
      console.log('3. Shared capacity across your entire fleet');
      console.log('4. Production-ready reliability');
    } else {
      console.log('\n💡 To test Redis functionality:');
      console.log('1. Install Redis: brew install redis (macOS)');
      console.log('2. Start Redis: redis-server');
      console.log('3. Run demo again');
    }

  } catch (error) {
    console.error('💥 Demo failed:', error);
    process.exit(1);
  }
}

// Run demo
main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
