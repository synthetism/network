import { 
  Unit, 
  type UnitProps, 
  createUnitSchema, 
  type TeachingContract,
  type UnitCore,
  Capabilities,
  Schema,
  Validator
} from '@synet/unit';

import { CircuitBreaker, type CircuitBreakerConfig, type CircuitBreakerStats } from '@synet/circuit-breaker';
import { Retry, type RetryConfig, type RetryStats } from '@synet/retry';
import { AsyncRateLimiter, type RateLimitContext } from '@synet/rate-limiter';
import { Http, type HttpRequest, type RequestResult } from '@synet/http';
import type { Logger } from '@synet/logger';

interface NetworkConfig {
  // HTTP config
  baseUrl?: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
  
  // Simple config for internal units
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  retry?: Partial<RetryConfig>;
  
  // Optional rate limiter injection (AsyncRateLimiter only)
  rateLimiter?: AsyncRateLimiter;
  
  // Optional logger
  logger?: Logger;
}

interface NetworkProps extends UnitProps {
  circuitBreakers: Map<string, CircuitBreaker>;  // URL -> CircuitBreaker mapping
  retryUnit: Retry;                              // Internal retry operations
  httpUnit: Http;                                // Internal HTTP operations
  rateLimiter?: AsyncRateLimiter;                // Optional injected rate limiter
  logger?: Logger;                               // Optional logger for debugging
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

  protected build(): UnitCore {
    const capabilities = Capabilities.create(this.dna.id, {
      // Core network capabilities
      request: (...args: unknown[]) => this.request(args[0] as string, args[1] as RequestOptions),
      getStats: async (...args: unknown[]) => await this.getStats()
    });

    const schema = Schema.create(this.dna.id, {
      request: {
        name: 'request',
        description: 'Execute HTTP request with resilience features',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Request URL' },
            options: { type: 'object', description: 'Request options (method, headers, body, timeout)' }
          },
          required: ['url']
        },
        response: {
          type: 'object',
          properties: {
            response: { type: 'object', description: 'HTTP response' },
            parsed: { type: 'object', description: 'Parsed response data' },
            requestId: { type: 'string', description: 'Request identifier' },
            timestamp: { type: 'string', description: 'Request timestamp' }
          },
          required: ['response', 'requestId', 'timestamp']
        }
      },
      getStats: {
        name: 'getStats',
        description: 'Get network statistics and monitoring data',
        parameters: {
          type: 'object',
          properties: {}
        },
        response: {
          type: 'object',
          properties: {
            circuitBreakerCount: { type: 'number', description: 'Number of circuit breakers' },
            hasRateLimiter: { type: 'boolean', description: 'Whether rate limiter is configured' },
            circuits: { type: 'object', description: 'Circuit breaker statistics' },
            retryStats: { type: 'object', description: 'Retry statistics' },
            rateLimitStats: { type: 'object', description: 'Rate limiting statistics' }
          },
          required: ['circuitBreakerCount', 'hasRateLimiter']
        }
      }
    });

    const validator = Validator.create({
      unitId: this.dna.id,
      capabilities,
      schema,
      strictMode: false
    });

    return { capabilities, schema, validator };
  }

    // Consciousness Trinity Access
  capabilities(): Capabilities { return this._unit.capabilities; }
  schema(): Schema { return this._unit.schema; }
  validator(): Validator { return this._unit.validator; }

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
      retryUnit,
      rateLimiter: config.rateLimiter, // Optional injection
      logger: config.logger
    };
    
    return new Network(props);
  }

  async request(url: string, options: RequestOptions = {}): Promise<RequestResult> {
    this.props.logger?.debug(`[${this.dna.id}] Request to ${url}`);
    
    // Optional rate limiting check (only if injected)
    if (this.props.rateLimiter) {
      // Create full URL for rate limiting context
      let fullUrl: string;
      try {
        // Try as absolute URL first
        fullUrl = new URL(url).href;
      } catch {
        // If relative, combine with base URL from HTTP unit
        const httpConfig = this.props.httpUnit.toJSON();
        const baseUrl = (httpConfig.baseUrl as string) || 'http://localhost';
        fullUrl = new URL(url, baseUrl).href;
      }
      
      const context: RateLimitContext = { 
        key: new URL(fullUrl).hostname,
        url: fullUrl
      };
      
      const limitResult = await this.props.rateLimiter.checkLimit(context);
      if (!limitResult.allowed) {
        const error = new Error(`[${this.dna.id}] Rate limit exceeded for ${url}. Retry after ${limitResult.retryAfter}ms`);
        this.props.logger?.warn(error.message);
        throw error;
      }
      
      this.props.logger?.debug(`[${this.dna.id}] Rate limit check passed. Remaining: ${limitResult.remaining}`);
    }
    
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

  // Get rate limiter statistics (if available)
  async getRateLimitStats() {
    return this.props.rateLimiter ? await this.props.rateLimiter.getStats() : null;
  }

  // Get network statistics (async)
  async getStats() {
    const rateLimitStats = await this.getRateLimitStats();
    
    return {
      circuitBreakerCount: this.props.circuitBreakers.size,
      circuits: this.getCircuitStats(),
      retryStats: this.getRetryStats(),
      hasRateLimiter: !!this.props.rateLimiter,
      rateLimitStats,
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
      capabilities: this._unit.capabilities,
      schema: this._unit.schema,
      validator: this._unit.validator
    };
  }

  whoami(): string {
    const circuitCount = this.props.circuitBreakers.size;
    const retryStats = this.getRetryStats();
    const rateLimiterStatus = this.props.rateLimiter ? ' + Rate Limiter' : '';
    
    return `Network[${circuitCount} circuits, ${retryStats.totalRetries} retries${rateLimiterStatus}] - Conscious HTTP + Circuit Protection + Intelligent Retry - v${this.dna.version}`;
  }

  help(): string {
    
    return `
Network v${this.dna.version} - Conscious HTTP + Circuit Protection + Intelligent Retry + Optional Rate Limiting

ONE METHOD TO RULE THEM ALL:
• request(url, options?) - Conscious HTTP with automatic resilience

Request Flow:
1. Rate Limiting Check (if configured)
2. Circuit Breaker Check (per URL)
3. HTTP Request with Intelligent Retry
4. Success/Failure Learning

Request Options:
• method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' (default: 'GET')
• headers: Record<string, string> (merged with defaults)
• body: string | object (JSON stringified if object)
• timeout: number (default: 30000ms)

Configuration Examples:

Basic Network:
  const network = Network.create({
    baseUrl: 'https://api.example.com'
  });

With Custom Retry/Circuit Breaker:
  const network = Network.create({
    baseUrl: 'https://api.example.com',
    retry: { maxAttempts: 5, baseDelay: 2000 },
    circuitBreaker: { failureThreshold: 3, timeout: 30000 }
  });

With Rate Limiting (Advanced):
  const rateLimiter = AsyncRateLimiter.create({
    requests: 100,
    window: 60000,  // 1 minute
    keyGenerator: (context) => context.key || 'default'
  });
  
  const network = Network.create({
    baseUrl: 'https://api.example.com',
    rateLimiter
  });

🔧 Management:
• getCircuitStats() - View all circuit states
• getRetryStats() - View retry performance
• getRateLimitStats() - View rate limiting stats (async, if configured)
• getStats() - Complete network statistics with rate limiting
• resetCircuits() - Reset all circuit breakers
• toJson() - Serialize for persistence/logging
`;
  }
}

export { Network, type NetworkConfig, type NetworkProps, type RequestOptions };
