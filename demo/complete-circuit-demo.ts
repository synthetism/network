#!/usr/bin/env node

/**
 * SYNET Network Unit - Complete Circuit Breaker Demo
 * 
 * Demonstrates:
 * - Network unit with KV rate limiter + circuit breaker
 * - Circuit breaker states: CLOSED → OPEN → HALF_OPEN → CLOSED
 * - Fast failure when circuit is OPEN
 * - Automatic recovery testing
 * - Complete resilience stack integration
 */

import { Network } from '../src/index.js';
import { RateLimiter, StorageBinding } from '@synet/rate-limiter';
import { KeyValue, MemoryAdapter } from '@synet/kv';

// Demo result tracking
interface DemoResult {
  id: number;
  success: boolean;
  duration: number;
  status?: number;
  error?: string;
  circuitState?: string;
}

// KV Storage binding for rate limiter
class KVStorageBinding implements StorageBinding {
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
  console.log('🔌 SYNET Complete Circuit Breaker Demo\n');

  // 1. Create KV storage for rate limiter
  console.log('1️⃣ Setting up KV storage with memory adapter...');
  const adapter = new MemoryAdapter();
  const kv = KeyValue.create({ 
    adapter,
    namespace: 'circuit-demo' 
  });
  
  const storage = new KVStorageBinding(kv);

  // 2. Create rate limiter with generous limits (we want to test circuit breaker, not rate limiting)
  console.log('2️⃣ Creating rate limiter with generous limits...');
  const rateLimiter = RateLimiter.create({
    requests: 20,  // High limit so circuit breaker is the main constraint
    window: 10000, // 10 seconds
    burst: 5,
    storage
  });

  // 3. Create Network with aggressive circuit breaker configuration
  console.log('3️⃣ Creating network with aggressive circuit breaker...');
  const network = Network.create({
    baseUrl: 'https://httpbin.org',
    timeout: 3000,  // Short timeout to trigger failures
    retry: {
      maxAttempts: 2,  // Fewer retries to trigger circuit faster
      baseDelay: 500,
      jitter: false
    },
    circuitBreaker: {
      failureThreshold: 2,    // Trip after just 2 failures
      timeoutMs: 5000,        // Recovery test after 5 seconds
      halfOpenSuccessThreshold: 1  // Single success closes circuit
    },
    rateLimiter
  });

  console.log('🔧 Configuration:');
  console.log(`- Network: ${network.whoami()}`);
  console.log(`- Rate Limiter: ${rateLimiter.whoami()}`);
  console.log('- Circuit Breaker: Trip after 2 failures, recover in 5s');
  console.log('- HTTP Timeout: 3s (to trigger failures)');
  console.log('');

  // Phase 1: Normal operation (Circuit CLOSED)
  console.log('🟢 PHASE 1: Normal Operation (Circuit CLOSED)\n');
  
  try {
    const result1 = await makeRequest(network, 1, '/delay/1'); // Should succeed
    console.log(`Result: ${result1.success ? 'SUCCESS' : 'FAILED'} (${result1.duration}ms)\n`);
  } catch (error) {
    console.log(`Error: ${error}\n`);
  }

  // Phase 2: Trigger failures to open circuit
  console.log('🔴 PHASE 2: Triggering Failures (Circuit CLOSED → OPEN)\n');
  
  const failureResults: DemoResult[] = [];
  
  // Make requests to slow endpoint to trigger timeouts
  for (let i = 2; i <= 4; i++) {
    console.log(`--- Failure Request ${i} ---`);
    try {
      const result = await makeRequest(network, i, '/delay/5'); // 5s delay > 3s timeout
      failureResults.push(result);
      console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.duration}ms)`);
    } catch (error) {
      const result: DemoResult = {
        id: i,
        success: false,
        duration: 3000,
        error: error instanceof Error ? error.message : String(error)
      };
      failureResults.push(result);
      console.log(`Error: ${result.error}`);
    }
    
    // Show circuit state
    const circuitStats = network.getCircuitStats();
    const delayCircuit = circuitStats['https://httpbin.org/delay/5'];
    if (delayCircuit) {
      console.log(`🔌 Circuit state: ${delayCircuit.state} (failures: ${delayCircuit.failures}/${delayCircuit.config.failureThreshold})`);
    }
    console.log('');
  }

  // Phase 3: Test fast failure when circuit is OPEN
  console.log('⚡ PHASE 3: Fast Failure (Circuit OPEN)\n');
  
  console.log('Making 3 rapid requests to show fast failure...');
  const fastFailurePromises: Promise<DemoResult>[] = [];
  
  for (let i = 5; i <= 7; i++) {
    const promise = makeRequest(network, i, '/delay/5').catch(error => ({
      id: i,
      success: false,
      duration: 0,
      error: error instanceof Error ? error.message : String(error)
    }));
    fastFailurePromises.push(promise);
  }
  
  const fastResults = await Promise.all(fastFailurePromises);
  
  fastResults.forEach(result => {
    console.log(`⚡ Request ${result.id}: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.duration}ms)`);
    if (result.error) console.log(`   Error: ${result.error}`);
  });
  
  console.log('\n✅ Notice: Fast failures (< 50ms) vs normal timeouts (3000ms)\n');

  // Phase 4: Wait for recovery window
  console.log('🕐 PHASE 4: Waiting for Recovery Window (5 seconds)\n');
  
  console.log('⏳ Waiting for circuit recovery timeout...');
  await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6s (> 5s recovery timeout)
  
  // Phase 5: Test recovery (HALF_OPEN state)
  console.log('🟡 PHASE 5: Testing Recovery (Circuit HALF_OPEN)\n');
  
  console.log('Making recovery request to fast endpoint...');
  try {
    const recoveryResult = await makeRequest(network, 8, '/delay/1'); // Fast endpoint
    console.log(`Recovery result: ${recoveryResult.success ? 'SUCCESS' : 'FAILED'} (${recoveryResult.duration}ms)`);
    
    if (recoveryResult.success) {
      console.log('🟢 Circuit recovered! Now CLOSED again.\n');
    }
  } catch (error) {
    console.log(`Recovery failed: ${error}\n`);
  }

  // Phase 6: Verify circuit is healthy
  console.log('🟢 PHASE 6: Verifying Healthy Operation (Circuit CLOSED)\n');
  
  for (let i = 9; i <= 10; i++) {
    try {
      const result = await makeRequest(network, i, '/delay/1');
      console.log(`✅ Request ${i}: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.duration}ms)`);
    } catch (error) {
      console.log(`❌ Request ${i}: Error - ${error}`);
    }
  }

  // Final statistics
  console.log('\n📊 FINAL STATISTICS\n');
  
  const stats = await network.getStats();
  console.log('Network Stats:');
  console.log(`- Circuit Breakers: ${stats.circuitBreakerCount}`);
  console.log(`- Has Rate Limiter: ${stats.hasRateLimiter}`);
  console.log(`- Total Retries: ${stats.retryStats.totalRetries}`);
  console.log('');
  
  console.log('Circuit Breaker Details:');
  const circuitStats = network.getCircuitStats();
  for (const [url, circuit] of Object.entries(circuitStats)) {
    console.log(`\n🔌 ${url}:`);
    console.log(`   State: ${circuit.state}`);
    console.log(`   Failures: ${circuit.failures}/${circuit.config.failureThreshold}`);
    console.log(`   Success Count: ${circuit.successCount}`);
    console.log(`   Last Failure: ${circuit.lastFailure ? new Date(circuit.lastFailure).toISOString() : 'None'}`);
  }
  
  if (stats.rateLimitStats) {
    console.log('\nRate Limiter Stats:');
    console.log(JSON.stringify(stats.rateLimitStats, null, 2));
  }

  console.log('\n🎉 CIRCUIT BREAKER DEMO COMPLETE!');
  console.log('\nKey Observations:');
  console.log('1. Circuit CLOSED: Normal operation with full latency');
  console.log('2. Circuit OPEN: Fast failures (< 50ms) protecting system');
  console.log('3. Circuit HALF_OPEN: Testing recovery with single request');
  console.log('4. Circuit CLOSED: Normal operation restored');
  console.log('\n💡 Circuit breaker prevents cascade failures and enables graceful degradation!');
}

// Helper function to make a request and track timing
async function makeRequest(network: Network, id: number, endpoint: string): Promise<DemoResult> {
  const startTime = Date.now();
  
  try {
    const result = await network.request(endpoint, { method: 'GET' });
    const duration = Date.now() - startTime;
    const success = result.response.status >= 200 && result.response.status < 300;
    
    return {
      id,
      success,
      duration,
      status: result.response.status
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    throw error; // Re-throw to be handled by caller
  }
}

// Run demo with error handling
main().catch(error => {
  console.error('💥 Demo failed:', error);
  process.exit(1);
});
