/**
 * Network + Proxy Integration Demo
 * 
 * Demonstrates the complete integration of:
 * - ProxyUnit for proxy pool management
 * - Network for conscious HTTP requests
 * - OculusSource for proxy provisioning
 * 
 * Tests IP change verification via httpbin.org/ip
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ProxyUnit, OculusSource } from '@synet/proxy';
import { Network } from '../src/network.unit.js';

async function main() {
  console.log('🎯 Network + Proxy Integration Demo\n');

  // Load Oculus credentials
  const oculusConfigPath = path.join('private', 'oculus.json');
  let oculusConfig: { apiToken: string; orderToken: string; whiteListIP?: string[] };
  
  try {
    oculusConfig = JSON.parse(readFileSync(oculusConfigPath, 'utf-8'));
    console.log('✅ Loaded Oculus credentials');
  } catch (error) {
    console.error('❌ Failed to load Oculus credentials from private/oculus.json');
    console.error('   Please ensure the file exists with apiToken and orderToken');
    return;
  }

  // Create Oculus source
  const oculusSource = new OculusSource({
    apiToken: oculusConfig.apiToken,
    orderToken: oculusConfig.orderToken,
    planType: 'SHARED_DC',
    whiteListIP: oculusConfig.whiteListIP || []
  });

  console.log('🔄 Creating proxy unit with Oculus source...');
  
  // Create proxy unit
  const proxyUnit = ProxyUnit.create({
    sources: [oculusSource]
  });

  

  // Initialize proxy pool
  console.log('⚡ Initializing proxy pool...');
  try {
    await proxyUnit.init();
    console.log('✅ Proxy pool initialized');
    
    const stats = proxyUnit.getStats();
    console.log(`   Pool size: ${stats.currentSize}/${stats.poolSize}`);
    console.log(`   Available: ${stats.available}`);
  } catch (error) {
    console.error('❌ Failed to initialize proxy pool:', error instanceof Error ? error.message : String(error));
    return;
  }

  // Create network unit with proxy integration
  console.log('🌐 Creating network unit with proxy integration...');
  const network = Network.create({
    baseUrl: 'https://httpbin.org',
    timeout: 15000,
    proxy: proxyUnit
    // Note: Logger would need to be a proper Logger unit instance
  });

  console.log('📊 Network Unit:', network.whoami());
  console.log('📊 Proxy Unit:', proxyUnit.whoami());
  console.log();

  try {
    // Test 1: Direct request (no proxy should be used in this case)
    console.log('🌐 Test 1: Direct request to get baseline IP...');
    const directNetwork = Network.create({
      baseUrl: 'https://httpbin.org',
      timeout: 10000
    });

    const directResult = await directNetwork.request('/ip');
    let directIP = 'unknown';
    
    if (directResult.response.ok) {
      console.log('✅ Direct request successful');
      console.log(`   Status: ${directResult.response.status}`);
      console.log(`   Duration: ${directResult.response.duration}ms`);
      
      const parsed = directResult.parsed as { origin?: string };
      if (parsed?.origin) {
        directIP = parsed.origin;
        console.log(`   Direct IP: ${directIP}`);
      }
    } else {
      console.log('❌ Direct request failed');
    }

    console.log();

    // Test 2: Request with proxy
    console.log('🔗 Test 2: Request with proxy integration...');
    
    const proxiedResult = await network.request('/ip', {
      headers: {
        'User-Agent': 'SYNET-Network-Proxy-Demo/1.0.0'
      }
    });

    if (proxiedResult.response.ok) {
      console.log('✅ Proxied request successful');
      console.log(`   Status: ${proxiedResult.response.status}`);
      console.log(`   Duration: ${proxiedResult.response.duration}ms`);
      
      const parsed = proxiedResult.parsed as { origin?: string };
      if (parsed?.origin) {
        const proxiedIP = parsed.origin;
        console.log(`   Proxied IP: ${proxiedIP}`);
        
        // IP Comparison
        if (directIP !== 'unknown' && proxiedIP !== directIP) {
          console.log('🎯 SUCCESS: IP changed through proxy!');
          console.log(`   Direct:  ${directIP}`);
          console.log(`   Proxied: ${proxiedIP}`);
        } else if (directIP !== 'unknown' && proxiedIP === directIP) {
          console.log('⚠️  WARNING: IP unchanged - proxy may not be working or bypassed');
        } else {
          console.log('ℹ️  IP comparison inconclusive');
        }
      }
    } else {
      console.log('❌ Proxied request failed');
      console.log(`   Status: ${proxiedResult.response.status}`);
      console.log(`   Error: ${proxiedResult.response.statusText}`);
    }

    console.log();

    // Test 3: Multiple requests to test proxy rotation
    console.log('🔄 Test 3: Multiple requests to test proxy rotation...');
    
    for (let i = 1; i <= 3; i++) {
      console.log(`\n📡 Request ${i}/3...`);
      
      const result = await network.request('/ip');
      
      if (result.response.ok) {
        const parsed = result.parsed as { origin?: string };
        const ip = parsed?.origin || 'unknown';
        console.log(`   ✅ Success - IP: ${ip} (${result.response.duration}ms)`);
      } else {
        console.log(`   ❌ Failed - Status: ${result.response.status}`);
      }
    }

    console.log();

    // Display final statistics
    console.log('📊 Final Statistics:');
    
    const proxyStats = proxyUnit.getStats();
    console.log('   Proxy Pool:');
    console.log(`     Size: ${proxyStats.currentSize}/${proxyStats.poolSize}`);
    console.log(`     Available: ${proxyStats.available}`);
    console.log(`     Initialized: ${proxyStats.initialized}`);
    
    const networkStats = await network.getStats();
    console.log('   Network:');
    console.log(`     Circuit Breakers: ${networkStats.circuitBreakerCount}`);
    console.log(`     Has Proxy: ${networkStats.hasProxy}`);
    console.log(`     Total Retries: ${networkStats.retryStats.totalRetries}`);

  } catch (error) {
    console.error('💥 Demo failed:', error instanceof Error ? error.message : String(error));
  }

  console.log();
  console.log('🎉 Network + Proxy Integration Demo Complete!');
  console.log();
  console.log('Integration Features Demonstrated:');
  console.log('✅ Proxy pool initialization with Oculus source');
  console.log('✅ Network unit with injected proxy dependency');
  console.log('✅ Automatic proxy usage for HTTP requests');
  console.log('✅ IP change verification through proxy');
  console.log('✅ Statistics and monitoring integration');
  console.log('✅ Error handling and graceful degradation');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as networkProxyDemo };
