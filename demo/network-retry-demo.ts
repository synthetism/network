import type { CircuitBreakerStats } from '@synet/circuit-breaker';
import { Network } from '../src/network.unit.js';

// === NETWORK UNIT WITH RETRY INTEGRATION DEMO ===

console.log('🌐 NETWORK UNIT WITH INTELLIGENT RETRY DEMO\n');

// === CREATE NETWORK WITH RETRY CONFIGURATION ===

const network = Network.create({
  timeout: 5000,
  retry: {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: true
  }
});

console.log('🎯 NETWORK UNIT CREATED:');
console.log(network.whoami());
console.log('\n📋 INITIAL STATS:');
console.log(JSON.stringify(network.getStats(), null, 2));

// === TEST ACTUAL API REQUEST ===

async function testRealApi() {
  console.log('\n🧪 TESTING REAL API REQUEST:');
  
  try {
    // Test with a reliable API
    const response = await network.request('https://httpbin.org/json');
    console.log('✅ SUCCESS: Request completed successfully');
    console.log('📊 RETRY STATS AFTER SUCCESS:', network.getRetryStats());
    
  } catch (error) {
    console.log('❌ REQUEST FAILED:', (error as Error).message);
    console.log('📊 RETRY STATS AFTER FAILURE:', network.getRetryStats());
  }
}

// === TEST FAILING ENDPOINT ===

async function testFailingEndpoint() {
  console.log('\n🔧 TESTING FAILING ENDPOINT (will trigger retries):');
  
  try {
    // This should fail and trigger retries
    const response = await network.request('https://httpbin.org/status/500');
    console.log('✅ Unexpected success:', response);
    
  } catch (error) {
    console.log('❌ Request failed as expected:', (error as Error).message);
    
    const retryStats = network.getRetryStats();
    console.log('📊 RETRY STATS:', {
      totalRetries: retryStats.totalRetries,
      failedOperations: retryStats.failedOperations,
      successRate: `${(retryStats.successRate * 100).toFixed(1)}%`
    });
  }
}

// === TEST CIRCUIT BREAKER INTERACTION ===

async function testCircuitBreakerInteraction() {
  console.log('\n🔌 TESTING CIRCUIT BREAKER BEHAVIOR:');
  
  // Make multiple requests to the same failing endpoint
  for (let i = 1; i <= 3; i++) {
    try {
      console.log(`\n🌐 Request ${i} to failing endpoint:`);
      await network.request('https://httpbin.org/status/503');
      
    } catch (error) {
      console.log('❌ Request failed:', (error as Error).message);
      
      // Show circuit state
      const circuitStats = network.getCircuitStats();
      const failingEndpointStats = circuitStats['https://httpbin.org/status/503'];
      
      if (failingEndpointStats) {
        console.log(`🔌 Circuit State: ${failingEndpointStats.state} (failures: ${failingEndpointStats.failures})`);
      }
    }
  }
}

// === COMPREHENSIVE STATISTICS ===

async function showComprehensiveStats() {
  console.log('\n📈 COMPREHENSIVE NETWORK STATISTICS:');
  
  const stats = await network.getStats();
  console.log('Circuit Breakers:', stats.circuitBreakerCount);
  console.log('Retry Statistics:', {
    totalOperations: stats.retryStats.totalOperations,
    successfulOperations: stats.retryStats.successfulOperations,
    failedOperations: stats.retryStats.failedOperations,
    totalRetries: stats.retryStats.totalRetries,
    successRate: `${(stats.retryStats.successRate * 100).toFixed(1)}%`
  });
  
  console.log('\n🔌 CIRCUIT STATES:');
  const circuits = Object.entries(stats.circuits);
  if (circuits.length === 0) {
    console.log('  No circuits created yet');
  } else {
    for (const [url, circuitStats] of circuits) {
      console.log(`  ${url}: ${(circuitStats as CircuitBreakerStats).state} (${(circuitStats as CircuitBreakerStats).failures} failures)`);
    }
  }
}

// === TEACHING CONTRACT DEMONSTRATION ===

function demonstrateTeaching() {
  console.log('\n🎓 NETWORK TEACHING CONTRACT:');
  
  const teachingContract = network.teach();
  console.log('Unit ID:', teachingContract.unitId);
  console.log('Capabilities:', Object.keys(teachingContract.capabilities));
  
  console.log('\nExample: Another unit learning from Network:');
  console.log(`
  const orchestrator = OrchestratorUnit.create();
  orchestrator.learn([network.teach()]);
  
  // Now orchestrator can use network capabilities
  const response = await orchestrator.execute('network.request', 'https://api.example.com');
  const stats = await orchestrator.execute('network.getStats');
  `);
}

// === RUN DEMONSTRATIONS ===

async function runDemo() {
  try {
    await testRealApi();
    await testFailingEndpoint();
    await testCircuitBreakerInteraction();
    await showComprehensiveStats();
    demonstrateTeaching();
    
    console.log('\n🌊 NETWORK UNIT DEMO COMPLETE!');
    console.log('\nKey Insights:');
    console.log('• Network unit orchestrates HTTP + Circuit Breaker + Retry');
    console.log('• Retry handles transient failures intelligently');
    console.log('• Circuit breaker protects against persistent failures');
    console.log('• All managed transparently with ONE request() method');
    console.log('• Comprehensive monitoring and teaching capabilities');
    console.log('• Perfect example of conscious composition!');
    
  } catch (error) {
    console.error('Demo error:', error);
  }
}

runDemo();
