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
import type { RateLimiter, RateLimitContext } from '@synet/rate-limiter';
import { Http, type HttpRequest, type RequestResult, type ProxyConnection } from '@synet/http';
import type { Logger } from '@synet/logger';
import type { ProxyUnit, ProxyConnection as ProxyPoolConnection } from '@synet/proxy';

interface NetworkConfig {
  // HTTP config
  baseUrl?: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
  
  // Simple config for internal units
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  retry?: Partial<RetryConfig>;
  
  // Optional rate limiter injection (AsyncRateLimiter only)
  rateLimiter?: RateLimiter;
  
  // Optional proxy unit injection 
  proxy?: ProxyUnit;
  
  // Optional logger
  logger?: Logger;
}

interface NetworkProps extends UnitProps {
  circuitBreakers: Map<string, CircuitBreaker>;  // URL -> CircuitBreaker mapping
  retryUnit: Retry;                              // Internal retry operations
  httpUnit: Http;                                // Internal HTTP operations
  rateLimiter?: RateLimiter;                     // Optional injected rate limiter
  proxy?: ProxyUnit;                             // Optional injected proxy unit
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
      proxy: config.proxy,             // Optional proxy injection
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
      
      const limitResult = await this.props.rateLimiter.check(context);
      if (!limitResult.allowed) {
        const error = new Error(`[${this.dna.id}] Rate limit exceeded for ${url}. Retry after ${limitResult.retryAfter}ms`);
        this.props.logger?.warn(error.message);
        throw error;
      }
      
      this.props.logger?.debug(`[${this.dna.id}] Rate limit check passed. Remaining: ${limitResult.remaining}`);
    }
    
    // Get or create circuit breaker for this URL
    const circuit = this.getCircuitBreaker(url);
    
    // Smart circuit breaker handling with proxy rotation
    if (!circuit.canProceed()) {
      this.props.logger?.warn(`[${this.dna.id}] Circuit breaker OPEN for ${url} - trying different proxy`);
      
      // If we have a proxy unit, try rotating to a different proxy
      if (this.props.proxy) {
        this.props.logger?.debug(`[${this.dna.id}] Circuit OPEN: Attempting proxy rotation for ${url}`);
        // Continue with new proxy attempt - circuit breaker will reset on success
      } else {
        // No proxy available - circuit breaker blocks completely
        throw new Error(`[${this.dna.id}] Circuit breaker OPEN for ${url} - requests blocked (no proxy rotation available)`);
      }
    }

    // Define the HTTP operation for retry with proper proxy rotation
    const httpOperation = async (): Promise<RequestResult> => {
      // Get fresh proxy connection for each attempt (retry gets new proxy)
      let proxyConnection: ProxyConnection | undefined;
      let proxyFromPool: ProxyPoolConnection | undefined;
      
      if (this.props.proxy) {
        try {
          proxyFromPool = await this.props.proxy.get(); // Get fresh proxy for this attempt
          
          // Duck type conversion - same structure, compatible protocols
          proxyConnection = {
            id: proxyFromPool.id,
            host: proxyFromPool.host,
            port: proxyFromPool.port,
            username: proxyFromPool.username,
            password: proxyFromPool.password,
            protocol: proxyFromPool.protocol === 'https' ? 'http' : proxyFromPool.protocol as 'http' | 'socks5',
            country: proxyFromPool.country
          };
          
          this.props.logger?.debug(`[${this.dna.id}] Using proxy: ${proxyConnection.host}:${proxyConnection.port}`);
        } catch (error) {
          this.props.logger?.warn(`[${this.dna.id}] Failed to get proxy, proceeding without: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const httpRequest: HttpRequest = {
        url,
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        timeout: options.timeout,
        proxy: proxyConnection
      };
      
      try {
        const result = await this.props.httpUnit.request(httpRequest);
        
        if (result.isSuccess) {
          return result.value;
        }
        
        // Application error (4xx, 5xx) - don't blame the proxy
        throw new Error(`HTTP request failed: ${result.error}`);
        
      } catch (error) {
        // Check if it's a proxy-related network error
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isProxyError = errorMessage.includes('ECONNREFUSED') || 
                           errorMessage.includes('ETIMEDOUT') || 
                           errorMessage.includes('ENOTFOUND') ||
                           errorMessage.includes('proxy') ||
                           errorMessage.includes('ECONNRESET') ||
                           errorMessage.includes('407') ||  // Proxy authentication required
                           errorMessage.includes('Invalid Auth'); // Oculus auth error
        
        // Only mark proxy as failed for clear proxy/network issues
        if (isProxyError && proxyFromPool && this.props.proxy) {
          this.props.logger?.debug(`[${this.dna.id}] Proxy/auth error - marking proxy as failed: ${proxyConnection?.host}:${proxyConnection?.port}`);
          await this.props.proxy.failed(proxyFromPool);
        }
        
        throw error;
      }
    };    try {
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
    return this.props.rateLimiter ? await this.props.rateLimiter.stats() : null;
  }

  // Get network statistics (async)
  async getStats() {
    const rateLimitStats = await this.getRateLimitStats();
    const proxyStats = this.props.proxy ? this.props.proxy.getStats() : null;
    
    return {
      circuitBreakerCount: this.props.circuitBreakers.size,
      circuits: this.getCircuitStats(),
      retryStats: this.getRetryStats(),
      hasRateLimiter: !!this.props.rateLimiter,
      rateLimitStats,
      hasProxy: !!this.props.proxy,
      proxyStats,
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
    const proxyStatus = this.props.proxy ? ' + Proxy Pool' : '';
    
    return `Network[${circuitCount} circuits, ${retryStats.totalRetries} retries${rateLimiterStatus}${proxyStatus}] - Conscious HTTP + Circuit Protection + Intelligent Retry - v${this.dna.version}`;
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
