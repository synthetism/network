import { describe, it, expect } from 'vitest';
import { Network } from '../src/index.js';

describe('Network Unit - 80/20 Composition Tests', () => {
  it('should create network with HTTP and circuit breaker composition', () => {
    const network = Network.create({
      baseUrl: 'https://api.example.com',
      timeout: 5000
    });
    
    expect(network).toBeDefined();
    expect(network.whoami()).toContain('Network');
    expect(network.whoami()).toContain('Circuit Protection');
  });

  it('should manage circuit breakers per URL', () => {
    const network = Network.create();
    
    const stats = network.getStats();
    expect(stats.circuitBreakerCount).toBe(0);
    expect(stats.httpUnit).toContain('HttpUnit');
  });

  it('should provide circuit management capabilities', () => {
    const network = Network.create();
    
    // Should start with no circuits
    expect(network.getCircuitStats()).toEqual({});
    
    // Reset should work even with no circuits
    network.resetCircuits();
    expect(network.getCircuitStats()).toEqual({});
  });

  it('should teach network capabilities', () => {
    const network = Network.create();
    
    const contract = network.teach();
    
    expect(contract.unitId).toBe('network');
    expect(contract.capabilities.request).toBeDefined();
    expect(contract.capabilities.getCircuitStats).toBeDefined();
    expect(contract.capabilities.resetCircuits).toBeDefined();
    expect(contract.capabilities.getStats).toBeDefined();
    expect(contract.capabilities.toJson).toBeDefined();
  });

  it('should serialize network state to JSON', () => {
    const network = Network.create({
      baseUrl: 'https://api.example.com'
    });
    
    const json = network.toJson();
    const data = JSON.parse(json);
    
    expect(data.unitId).toBe('network');
    expect(data.version).toBe('1.0.0');
    expect(data.circuitBreakerCount).toBe(0);
    expect(data.httpUnit).toContain('HttpUnit');
    expect(data.timestamp).toBeCloseTo(Date.now(), -2);
  });


});
