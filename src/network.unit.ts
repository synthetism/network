import { Unit, type UnitProps, createUnitSchema, type TeachingContract } from '@synet/unit';
import { CircuitBreaker, type CircuitBreakerConfig } from '@synet/circuit-breaker';
import { Http, type HttpRequest, type RequestResult } from '@synet/http';

interface NetworkConfig {
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  baseUrl?: string;
}

interface NetworkProps extends UnitProps {
  circuitBreakers: Map<string, CircuitBreaker>;  // URL -> CircuitBreaker mapping
  httpUnit: Http;  // Dependency injection for HTTP operations
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | object;
  timeout?: number;
}

class Network extends Unit<NetworkProps> {
  protected constructor(props: NetworkProps) {
    super(props);
  }

  static create(config: NetworkConfig = {}): Network {
    // Create HTTP unit dependency
    const httpUnit = Http.create({
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      defaultHeaders: config.defaultHeaders
    });
    
    const props: NetworkProps = {
      dna: createUnitSchema({ id: 'network', version: '1.0.0' }),
      circuitBreakers: new Map(),
      httpUnit
    };
    
    return new Network(props);
  }

  // 80/20 METHOD: ONE REQUEST TO RULE THEM ALL
  async request(url: string, options: RequestOptions = {}): Promise<RequestResult> {
    // Get or create circuit breaker for this URL
    const circuit = this.getCircuitBreaker(url);
    
    // Check circuit breaker - conscious failure protection
    if (!circuit.canProceed()) {
      throw new Error(`[${this.dna.id}] Circuit breaker OPEN for ${url} - requests blocked`);
    }

    try {
      // Orchestrate: Use HTTP unit to make the actual request
      const httpRequest: HttpRequest = {
        url,
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        timeout: options.timeout
      };
      
      const result = await this.props.httpUnit.request(httpRequest);
      
      if (result.isSuccess) {
        // Success - teach circuit breaker about good behavior
        circuit.recordSuccess();
        return result.value;
      } else {
        // HTTP unit returned failure
        circuit.recordFailure();
        throw new Error(`HTTP request failed: ${result.error}`);
      }
      
    } catch (error) {
      // Failure - teach circuit breaker about bad behavior
      circuit.recordFailure();
      
      // Re-throw with conscious context
      throw new Error(`[${this.dna.id}] Request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get or create circuit breaker for URL
  private getCircuitBreaker(url: string): CircuitBreaker {
    if (!this.props.circuitBreakers.has(url)) {
      const circuit = CircuitBreaker.create({ url });
      this.props.circuitBreakers.set(url, circuit);
    }
    
    return this.props.circuitBreakers.get(url)!;
  }

  // Get circuit breaker stats for monitoring
  getCircuitStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [url, circuit] of this.props.circuitBreakers.entries()) {
      stats[url] = circuit.getStats();
    }
    
    return stats;
  }

  // Reset all circuit breakers
  resetCircuits(): void {
    for (const circuit of this.props.circuitBreakers.values()) {
      circuit.resetCircuit();
    }
  }

  // Get network statistics
  getStats() {
    return {
      circuitBreakerCount: this.props.circuitBreakers.size,
      circuits: this.getCircuitStats(),
      httpUnit: this.props.httpUnit.whoami()
    };
  }

  // Serialize network state for persistence/logging
  toJson(): string {
    const data = {
      unitId: this.dna.id,
      version: this.dna.version,
      circuitBreakerCount: this.props.circuitBreakers.size,
      circuits: this.getCircuitStats(),
      httpUnit: this.props.httpUnit.whoami(),
      timestamp: Date.now()
    };
    
    return JSON.stringify(data, null, 2);
  }

  teach(): TeachingContract {
    return {
      unitId: this.dna.id,
      capabilities: {
        request: (...args: unknown[]) => this.request.bind(this)(args[0] as string, args[1] as RequestOptions),
        getCircuitStats: () => this.getCircuitStats.bind(this),
        resetCircuits: () => this.resetCircuits.bind(this),
        getStats: () => this.getStats.bind(this),
        toJson: () => this.toJson.bind(this)
      }
    };
  }

  whoami(): string {
    const circuitCount = this.props.circuitBreakers.size;
    return `Network[${circuitCount} circuits] - Conscious HTTP with Circuit Protection - v${this.dna.version}`;
  }

  help(): string {
    const stats = this.getStats();
    return `
Network v${this.dna.version} - 80/20 Conscious HTTP + Circuit Protection Composition

Current Circuits: ${stats.circuitBreakerCount}
HTTP Unit: ${stats.httpUnit}

🎯 ONE METHOD TO RULE THEM ALL:
• request(url, options?) - Conscious HTTP with automatic circuit protection

Request Options:
• method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' (default: 'GET')
• headers: Record<string, string> (merged with defaults)
• body: string | object (JSON stringified if object)
• timeout: number (default: 30000ms)

🧠 Conscious Features:
• Automatic Circuit Protection per URL
• Failure protection and recovery
• Success/failure learning
• Request blocking when circuits open
• Complete monitoring and stats

🔧 Management:
• getCircuitStats() - View all circuit states
• resetCircuits() - Reset all circuit breakers
• getStats() - Complete network statistics
• toJson() - Serialize for persistence/logging

Teaching:
• Teaches all network capabilities for composition
• Circuit Protection managed transparently
• Failure protection automatic per URL

Example:
  const network = Network.create();
  
  // Automatic circuit protection
  const response = await network.request('https://api.example.com');
  
  // Circuit learns from failures and blocks when needed
  console.log(network.getCircuitStats());
`;
  }
}

export { Network, type NetworkConfig, type NetworkProps, type RequestOptions };
