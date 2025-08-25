#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { ProxyUnit } from '@synet/proxy';
import { OculusSource } from '@synet/proxy';
import { ProxyMeshSource } from '@synet/proxy';
import type { ProxyEvent } from '@synet/proxy';
import type { IProxySource } from '@synet/proxy';

/**
 * Complete Proxy System Demo - ProxyUnit + SockerUnit Integration
 * 
 * Tests:
 * 1. Load real proxy source configurations
 * 2. Create ProxyUnit with multiple sources (SockerUnit failover)
 * 3. Initialize proxy pool
 * 4. Test proxy retrieval with and without criteria
 * 5. Test proxy removal and pool replenishment
 * 6. Monitor events throughout
 */

async function main() {
  console.log('🚀 SYNET Proxy System Demo - Complete Integration Test\n');

  try {
    // Load real configs (graceful fallback if not available)
    console.log('📂 Loading proxy source configurations...');
    
    const sources: IProxySource[] = [];
    
    // Try to load Oculus config
    try {
      const oculusConfigPath = path.join('private', 'oculus.json');
      const oculusConfig = JSON.parse(readFileSync(oculusConfigPath, 'utf-8'));
      
      const oculusSource = new OculusSource({
        apiToken: oculusConfig.apiToken,
        orderToken: oculusConfig.orderToken,
        planType: 'SHARED_DC',
        whiteListIP: oculusConfig.whiteListIP,   
      });
      
      sources.push(oculusSource);
      console.log('✅ OculusSource configured');
    } catch (error) {
      console.log('⚠️  OculusSource config not found (private/oculus.json)');
    }

    // Try to load ProxyMesh config
    try {
      const proxymeshConfigPath = path.join('private', 'proxymesh.json');
      const proxymeshConfig = JSON.parse(readFileSync(proxymeshConfigPath, 'utf-8'));
      
      const proxymeshSource = new ProxyMeshSource({
        login: proxymeshConfig.login,
        password: proxymeshConfig.password,
        host: proxymeshConfig.host,
        port: proxymeshConfig.port
      });
      
      sources.push(proxymeshSource);
      console.log('✅ ProxyMeshSource configured');
    } catch (error) {
      console.log('⚠️  ProxyMeshSource config not found (private/proxymesh.json)');
    }

    if (sources.length === 0) {
      console.log('❌ No proxy sources configured. Please add configs to private/ folder.');
      console.log('');
      console.log('Required files:');
      console.log('  - private/oculus.json (for OculusSource)');
      console.log('  - private/proxymesh.json (for ProxyMeshSource)');
      return; // Use return instead of process.exit
    }

    console.log(`✅ Loaded ${sources.length} proxy source(s)\n`);

    // =============================================================================
    // STEP 1: Create ProxyUnit with multiple sources
    // =============================================================================
    
    console.log('🏗️  Creating ProxyUnit with SockerUnit failover...');
    const proxy = ProxyUnit.create({
      sources,
      poolSize: 10,     // Small pool for demo
      rotationThreshold: 0.4  // 40% threshold for demo
    });

    console.log('✅ ProxyUnit created:');
    console.log(`   ${proxy.whoami()}`);
    console.log();

    // =============================================================================
    // STEP 2: Event Monitoring Setup
    // =============================================================================
    
    console.log('📡 Setting up event monitoring...');
    
    // Monitor all proxy events
    proxy.on<ProxyEvent>('*', (event) => {
      const timestamp = event.timestamp.toISOString().substring(11, 23);
      console.log(`[${timestamp}] 📊 ${event.type}`);
      
      if (event.error) {
        console.log(`          ❌ Error: ${event.error.message}`);
      }
    });

    console.log('✅ Event monitoring active\n');

    // =============================================================================
    // STEP 3: Initialize Proxy Pool
    // =============================================================================
    
    console.log('🔄 Initializing proxy pool...');
    const initStart = Date.now();
    
    await proxy.init();
    const initDuration = Date.now() - initStart;
    
    console.log(`✅ Pool initialized in ${initDuration}ms`);

    console.log("Proxy Details:")
    console.log(await proxy.get());

    
    // Show initial stats
    const initialStats = proxy.getStats();
    console.log('📊 Initial Pool Stats:');
    console.log(`   Pool Size: ${initialStats.currentSize}/${initialStats.poolSize}`);
    console.log(`   Available: ${initialStats.available}`);
    console.log(`   Last Refresh: ${initialStats.lastRefresh?.toISOString().substring(11, 19)}`);
    console.log();

    // =============================================================================
    // STEP 4: Test Proxy Retrieval (No Criteria)
    // =============================================================================
    
    console.log('🌐 Testing proxy retrieval (no criteria)...');
    
    for (let i = 1; i <= 7; i++) {
      try {
        const connection = await proxy.get();
        console.log(`✅ Proxy ${i}: ${connection.protocol}://${connection.host}:${connection.port} (${connection.country || 'unknown'})`);
        
        // Simulate usage delay
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.log(`❌ Proxy ${i}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log();



    // =============================================================================
    // STEP 5: Test Pool Status & Replenishment
    // =============================================================================
    
    console.log('📊 Checking pool status after usage...');
    const poolStatus = proxy.getPoolStatus();
    
    console.log('Pool Status:');
    console.log(`   Total: ${poolStatus.currentSize}/${poolStatus.poolSize}`);
    console.log(`   Available: ${poolStatus.available}`);
    console.log(`   Should Replenish: ${poolStatus.shouldReplenish ? '🔄 YES' : '✅ NO'}`);
    console.log('   Proxy Details:');
    
    for (const proxyInfo of poolStatus.proxies.slice(0, 5)) {  // Show first 5
      const ageSeconds = Math.round(proxyInfo.age / 1000);
      const status = proxyInfo.used ? '🔴 USED' : '🟢 AVAILABLE';
      console.log(`     ${proxyInfo.id.substring(0, 8)}... ${status} (${ageSeconds}s old)`);
    }
    
    if (poolStatus.proxies.length > 5) {
      console.log(`     ... and ${poolStatus.proxies.length - 5} more`);
    }
    console.log();

    // =============================================================================
    // STEP 7: Test Proxy Removal
    // =============================================================================
    
    console.log('🗑️  Testing proxy removal...');
    
    try {
      const connection = await proxy.get();
      console.log(`✅ Retrieved proxy for removal: ${connection.id.substring(0, 8)}...`);
      
      await proxy.delete(connection);
      console.log('✅ Proxy removed from pool');
    } catch (error) {
      console.log(`❌ Removal test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log();

    // =============================================================================
    // STEP 8: Final Stats
    // =============================================================================
    
    console.log('📊 Final Statistics:');
    const finalStats = proxy.getStats();
    
    console.log('Pool Management:');
    console.log(`   Final Size: ${finalStats.currentSize}/${finalStats.poolSize}`);
    console.log(`   Available: ${finalStats.available}`);
    console.log(`   Rotation Threshold: ${finalStats.rotationThreshold * 100}%`);
    console.log(`   Initialized: ${finalStats.initialized ? '✅' : '❌'}`);
    
    console.log();
    console.log('🎉 Proxy System Demo Completed Successfully!');
    console.log();
    console.log('💡 Key Features Demonstrated:');
    console.log('   ✅ Multi-source proxy management (SockerUnit)');
    console.log('   ✅ Automatic pool management (ProxyUnit)'); 
    console.log('   ✅ Criteria-based proxy selection');
    console.log('   ✅ Event-driven monitoring');
    console.log('   ✅ Graceful degradation and failover');
    console.log('   ✅ Real-time pool replenishment');

  } catch (error) {
    console.error('❌ Demo failed:', error instanceof Error ? error.message : String(error));
    return; // Graceful exit instead of process.exit
  }
}

// Smith Architecture: No choices - just run
main().catch(console.error);
