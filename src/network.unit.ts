import { Unit, type UnitProps, createUnitSchema, type TeachingContract } from '@synet/unit';
import { CircuitBreaker, type CircuitBreakerConfig, type CircuitBreakerStats } from '@synet/circuit-breaker';
import { Retry, type RetryConfig, type RetryStats } from '@synet/retry';
import { Http, type HttpRequest, type RequestResult } from '@synet/http';
import type { Logger } from '@synet/logger';
interface NetworkConfig {
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  retry?: Partial<RetryConfig>;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  baseUrl?: string;
}

interface NetworkProps extends UnitProps {
  circuitBreakers: Map<string, CircuitBreaker>;  // URL -> CircuitBreaker mapping
  retryUnit: Retry;  // Dependency injection for retry operations
  httpUnit: Http;  // Dependency injection for HTTP operations
  logger?: Logger;  // Optional logger for debugging
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
    
    // Create Retry unit dependency
    const retryUnit = Retry.create(config.retry || {});
    
    const props: NetworkProps = {
      dna: createUnitSchema({ id: 'network', version: '1.0.0' }),
      circuitBreakers: new Map(),
      httpUnit,
      retryUnit
    };
    
    return new Network(props);
  }

  async request(url: string, options: RequestOptions = {}): Promise<RequestResult> {
    // Get or create circuit breaker for this URL
    const circuit = this.getCircuitBreaker(url);
    
    // Check circuit breaker - conscious failure protection
    if (!circuit.canProceed()) {
      this.props.logger?.warn(`[${this.dna.id}] Circuit breaker OPEN for ${url} - requests blocked`);
      throw new Error(`[${this.dna.id}] Circuit breaker OPEN for ${url} - requests blocked`);
    }

    // Define the HTTP operation for retry
    const httpOperation = async (): Promise<RequestResult> => {
      const httpRequest: HttpRequest = {
        url,
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        timeout: options.timeout
      };
      
      const result = await this.props.httpUnit.request(httpRequest);
      
      if (result.isSuccess) {
        return result.value;
      }
      
      throw new Error(`HTTP request failed: ${result.error}`);
    };

    try {
      // Use retry unit for intelligent retry logic
      const retryResult = await this.props.retryUnit.retry(httpOperation, {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      });
      
      // Success - teach circuit breaker about good behavior
      circuit.recordSuccess();
      return retryResult.result;
      
    } catch (error) {
      // All retries failed - teach circuit breaker about bad behavior
      circuit.recordFailure();
      
      // Re-throw with conscious context
      throw new Error(`[${this.dna.id}] Request failed after retries: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get or create circuit breaker for URL
  private getCircuitBreaker(url: string): CircuitBreaker {
    if (!this.props.circuitBreakers.has(url)) {
      const circuit = CircuitBreaker.create({ url });
      this.props.circuitBreakers.set(url, circuit);
    }
    
    const circuitBreaker = this.props.circuitBreakers.get(url);
    if (!circuitBreaker) {
      throw new Error(`[${this.dna.id}] Circuit breaker not found for URL: ${url}`);
    }
    return circuitBreaker;
  }

  // Get circuit breaker stats for monitoring
  getCircuitStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
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

  // Get retry statistics
  getRetryStats(): RetryStats {
    return this.props.retryUnit.getStats();
  }

  // Get network statistics
  getStats() {
    return {
      circuitBreakerCount: this.props.circuitBreakers.size,
      circuits: this.getCircuitStats(),
      retryStats: this.getRetryStats(),
      httpUnit: this.props.httpUnit.whoami(),
      retryUnit: this.props.retryUnit.whoami()
    };
  }

  // Serialize network state for persistence/logging
  toJson(): string {
    const data = {
      unitId: this.dna.id,
      version: this.dna.version,
      circuitBreakerCount: this.props.circuitBreakers.size,
      circuits: this.getCircuitStats(),
      retryStats: this.getRetryStats(),
      httpUnit: this.props.httpUnit.whoami(),
      retryUnit: this.props.retryUnit.whoami(),
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
        getRetryStats: () => this.getRetryStats.bind(this),
        resetCircuits: () => this.resetCircuits.bind(this),
        getStats: () => this.getStats.bind(this),
        toJson: () => this.toJson.bind(this)
      }
    };
  }

  whoami(): string {
    const circuitCount = this.props.circuitBreakers.size;
    const retryStats = this.getRetryStats();
    return `Network[${circuitCount} circuits, ${retryStats.totalRetries} retries] - Conscious HTTP + Circuit Protection + Intelligent Retry - v${this.dna.version}`;
  }

  help(): string {
    const stats = this.getStats();
    return `
Network v${this.dna.version} - 80/20 Conscious HTTP + Circuit Protection + Intelligent Retry Composition

Current Circuits: ${stats.circuitBreakerCount}
HTTP Unit: ${stats.httpUnit}
Retry Unit: ${stats.retryUnit}
Total Retries: ${stats.retryStats.totalRetries}
Successful Operations: ${stats.retryStats.successfulOperations}
Failed Operations: ${stats.retryStats.failedOperations}

🎯 ONE METHOD TO RULE THEM ALL:
• request(url, options?) - Conscious HTTP with automatic circuit protection and intelligent retry

Request Options:
• method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' (default: 'GET')
• headers: Record<string, string> (merged with defaults)
• body: string | object (JSON stringified if object)
• timeout: number (default: 30000ms)

🧠 Conscious Features:
• Automatic Circuit Protection per URL
• Intelligent Retry with exponential backoff
• Failure protection and recovery
• Success/failure learning
• Request blocking when circuits open
• Complete monitoring and stats

🔧 Management:
• getCircuitStats() - View all circuit states
• getRetryStats() - View retry performance metrics
• resetCircuits() - Reset all circuit breakers
• getStats() - Complete network statistics
• toJson() - Serialize for persistence/logging

Teaching:
• Teaches all network capabilities for composition
• Circuit Protection + Retry managed transparently
• Failure protection automatic per URL

Example:
  const network = Network.create();
  
  // Automatic circuit protection + intelligent retry
  const response = await network.request('https://api.example.com');
  
  // Circuit learns from failures, retry handles transient issues
  console.log(network.getStats());
`;
  }
}

export { Network, type NetworkConfig, type NetworkProps, type RequestOptions };
