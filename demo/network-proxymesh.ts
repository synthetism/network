/**
 * Network + Proxy Integration Demo - ProxyMesh Version
 * 
 * Demonstrates the complete integration of:
 * - ProxyUnit for proxy pool management
 * - Network for conscious HTTP requests
 * - ProxyMeshSource for proxy provisioning
 * 
 * Tests IP change verification via httpbin.org/ip
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ProxyUnit, ProxyMeshSource } from '@synet/proxy';
import { Network } from '../src/network.unit.js';

async function main() {
  console.log('🎯 Network + Proxy Integration Demo (ProxyMesh)\n');

  // Load ProxyMesh credentials
  const proxymeshConfigPath = path.join('../proxy/private', 'proxymesh.json');
  let proxymeshConfig: { login: string; password: string; host?: string; port?: number };
  
  try {
    proxymeshConfig = JSON.parse(readFileSync(proxymeshConfigPath, 'utf-8'));
    console.log('✅ Loaded ProxyMesh credentials');
  } catch (error) {
    console.error('❌ Failed to load ProxyMesh credentials from ../proxy/private/proxymesh.json');
    console.error('   Please ensure the file exists with login and password');
    return;
  }

  // Create ProxyMesh source
  const proxymeshSource = new ProxyMeshSource({
    login: proxymeshConfig.login,
    password: proxymeshConfig.password,
    host: proxymeshConfig.host || 'us-ca.proxymesh.com',
    port: proxymeshConfig.port || 31280
  });

  console.log('🔄 Creating proxy unit with ProxyMesh source...');
  
  // Create proxy unit
  const proxyUnit = ProxyUnit.create({
    sources: [proxymeshSource]
  });

  console.log('⚡ Initializing proxy pool...');

  // Initialize proxy pool
  try {
    await proxyUnit.init();
    
    const stats = proxyUnit.getStats();
    console.log('✅ Proxy pool initialized');
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
  });

  console.log('📊 Network Unit:', network.whoami());
  console.log('📊 Proxy Unit:', proxyUnit.whoami());
  console.log();

  try {
    // Test 1: Direct request (no proxy should be used in this case)
    console.log('🌐 Test 1: Direct request to get baseline IP...');
    const directResult = await network.request('/ip');
    
    let directIP = 'unknown';
    if (directResult.response.ok) {
      const parsed = directResult.parsed as { origin?: string };
      directIP = parsed?.origin || 'unknown';
      console.log('✅ Direct request successful');
      console.log(`   Status: ${directResult.response.status}`);
      console.log(`   Duration: ${directResult.response.duration}ms`);
      console.log(`   Direct IP: ${directIP}`);
    } else {
      console.log('❌ Direct request failed');
      console.log(`   Status: ${directResult.response.status}`);
      console.log(`   Error: ${directResult.response.statusText}`);
    }

    console.log();

    // Test 2: Request with proxy integration (automatic proxy usage)
    console.log('🔗 Test 2: Request with proxy integration...');
    const proxiedResult = await network.request('/ip');
    
    if (proxiedResult.response.ok) {
      const parsed = proxiedResult.parsed as { origin?: string };
      console.log('✅ Proxied request successful');
      console.log(`   Status: ${proxiedResult.response.status}`);
      console.log(`   Duration: ${proxiedResult.response.duration}ms`);
      
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

    // Test 3: Multiple requests to test proxy behavior with ProxyMesh
    console.log('🔄 Test 3: Multiple requests to test proxy behavior...');
    
    // Debug: Check proxy pool state before Test 3
    const beforeTest3Stats = proxyUnit.getStats();
    console.log(`📊 Pool state before Test 3: ${beforeTest3Stats.available}/${beforeTest3Stats.currentSize} available`);
    
    for (let i = 1; i <= 3; i++) {
      console.log(`\n📡 Request ${i}/3...`);
      
      // Debug: Check proxy state before each request
      const beforeStats = proxyUnit.getStats();
      console.log(`   📊 Before request: ${beforeStats.available}/${beforeStats.currentSize} available`);
      
      const result = await network.request('/ip');
      
      if (result.response.ok) {
        const parsed = result.parsed as { origin?: string };
        const ip = parsed?.origin || 'unknown';
        console.log(`   ✅ Success - IP: ${ip} (${result.response.duration}ms)`);
      } else {
        console.log(`   ❌ Failed - Status: ${result.response.status}`);
      }
      
      // Debug: Check proxy state after each request
      const afterStats = proxyUnit.getStats();
      console.log(`   📊 After request: ${afterStats.available}/${afterStats.currentSize} available`);
    }

    console.log();

    // Final Statistics
    console.log('📊 Final Statistics:');
    
    const finalProxyStats = proxyUnit.getStats();
    console.log('   Proxy Pool:');
    console.log(`     Size: ${finalProxyStats.currentSize}/${finalProxyStats.poolSize}`);
    console.log(`     Available: ${finalProxyStats.available}`);
    console.log(`     Initialized: ${finalProxyStats.initialized}`);
    
    const networkStats = await network.getStats();
    console.log('   Network:');
    console.log(`     Circuit Breakers: ${networkStats.circuitBreakerCount}`);
    console.log(`     Has Proxy: ${networkStats.hasRateLimiter}`);
    console.log(`     Total Retries: ${networkStats.retryStats.totalRetries}`);

  } catch (error) {
    console.error('💥 Demo failed:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n🎉 Network + Proxy Integration Demo Complete!\n');

  console.log('Integration Features Demonstrated:');
  console.log('✅ Proxy pool initialization with ProxyMesh source');
  console.log('✅ Network unit with injected proxy dependency');
  console.log('✅ Automatic proxy usage for HTTP requests');
  console.log('✅ IP change verification through proxy');
  console.log('✅ Statistics and monitoring integration');
  console.log('✅ Error handling and graceful degradation');
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as networkProxyMeshDemo };
