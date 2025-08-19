#!/usr/bin/env node

/**
 * SYNET Network Unit - Rate Limiter Integration Demo
 * 
 * Demonstrates:
 * - Network unit with injected AsyncRateLimiter
 * - Rate limiting behavior with async operations
 * - Circuit breaker and retry composition
 * - Consciousness trinity capabilities
 */

import { Network } from '../dist/index.js';
import { AsyncRateLimiter } from '@synet/rate-limiter';

// Demo result type for tracking request outcomes
interface DemoResult {
  id: number;
  success: boolean;
  duration: number;
  status?: number;
  error?: string;
}

async function main() {
  console.log('🔗 SYNET Network Rate Limiter Demo\n');

  // Create AsyncRateLimiter - 3 requests per 2 seconds
  const rateLimiter = AsyncRateLimiter.create({
    requests: 3,
    window: 2000,
    burst: 1
  });

  console.log('📊 Rate Limiter Configuration:');
  console.log(`- Max Requests: ${rateLimiter.whoami()}`);
  console.log(`- Window: 2000ms`);
  console.log('');

  // Create Network with injected rate limiter
  const network = Network.create({
    baseUrl: 'https://httpbin.org',
    timeout: 5000,
    rateLimiter // Inject AsyncRateLimiter
  });

  console.log('🌐 Network Unit Created:');
  console.log(`- Identity: ${network.whoami()}`);
  console.log(`- Capabilities: ${network.capabilities().list().join(', ')}`);
  console.log('');

  // Test teaching contract
  const contract = network.teach();
  console.log('🎓 Teaching Contract:');
  console.log(`- Unit ID: ${contract.unitId}`);
  console.log(`- Available capabilities: ${contract.capabilities.list().join(', ')}`);
  console.log(`- Schema size: ${contract.schema.size()}`);
  console.log('');

  // Test rapid requests to trigger rate limiting
  console.log('🚀 Testing Rate Limiting (6 requests rapidly):');
  const requests: Promise<DemoResult>[] = [];
  
  for (let i = 1; i <= 6; i++) {
    console.log(`\n--- Request ${i} ---`);
    const startTime = Date.now();
    
    try {
      const promise = network.request('/delay/1', {
        method: 'GET'
      }).then(result => {
        const duration = Date.now() - startTime;
        // Check HTTP status for success (2xx status codes)
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
        console.log(`💥 Request ${i}: Exception (${duration}ms) - ${error.message}`);
        return { id: i, success: false, duration, error: error.message };
      });
      
      requests.push(promise);
      
      // Small delay between request initiations to see timing
      if (i < 6) await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`💥 Request ${i}: Exception - ${error}`);
    }
  }

  // Wait for all requests to complete
  console.log('\n⏳ Waiting for all requests to complete...\n');
  const results = await Promise.all(requests);

  // Analyze results
  console.log('📈 Results Analysis:');
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const error = result.error ? ` (${result.error})` : '';
    console.log(`${status} Request ${result.id}: ${result.duration}ms${error}`);
  });

  // Show network stats
  console.log('\n📊 Network Statistics:');
  const stats = await network.getStats();
  console.log(`- Circuit Breakers: ${stats.circuitBreakerCount}`);
  console.log(`- HTTP Unit: ${stats.httpUnit}`);
  console.log(`- Rate Limiter Active: ${stats.hasRateLimiter ? 'Yes' : 'No'}`);
  console.log(`- Rate Limit Stats: ${stats.rateLimitStats ? 'Available' : 'N/A'}`);

  // Test circuit stats
  console.log('\n🔌 Circuit Statistics:');
  const circuitStats = network.getCircuitStats();
  console.log(JSON.stringify(circuitStats, null, 2));

  // Test slower requests to show recovery
  console.log('\n🕐 Testing Recovery (2 requests with 3s delay):');
  
  for (let i = 1; i <= 2; i++) {
    console.log(`\n--- Recovery Request ${i} ---`);
    const startTime = Date.now();
    
    const result = await network.request('/delay/1', {
      method: 'GET'
    });
    
    const duration = Date.now() - startTime;
    const isSuccess = result.response.status >= 200 && result.response.status < 300;
    if (isSuccess) {
      console.log(`✅ Recovery ${i}: Success (${duration}ms) - Status: ${result.response.status}`);
    } else {
      console.log(`❌ Recovery ${i}: Failed (${duration}ms) - Status: ${result.response.status}`);
    }
    
    // Wait between recovery requests
    if (i < 2) {
      console.log('⏱️  Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Final stats
  console.log('\n📊 Final Network Statistics:');
  const finalStats = await network.getStats();
  console.log(JSON.stringify(finalStats, null, 2));

  console.log('\n🎉 Demo completed! Rate limiting successfully demonstrated.');
}

// Run demo with error handling
main().catch(error => {
  console.error('💥 Demo failed:', error);
  process.exit(1);
});
