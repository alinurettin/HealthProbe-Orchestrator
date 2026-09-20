// HealthProbe-Orchestrator v2.0.0 - Distributed Health Check & SLA Telemetry Orchestrator
// Multi-Protocol Synthetic Probers, Percentile Math (p50, p95, p99), Flapping Detection & Webhooks

const http = require('http');
const net = require('net');
const crypto = require('crypto');

/**
 * Mathematical Percentile Calculator using Nearest-Rank Algorithm
 */
function calculatePercentiles(latencies) {
  if (!latencies || latencies.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;

  const getRankVal = (pct) => {
    const rank = Math.ceil((pct / 100) * n) - 1;
    return sorted[Math.max(0, Math.min(n - 1, rank))];
  };

  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    p50: getRankVal(50),
    p90: getRankVal(90),
    p95: getRankVal(95),
    p99: getRankVal(99),
    min: sorted[0],
    max: sorted[n - 1],
    avg: parseFloat((sum / n).toFixed(2))
  };
}

/**
 * Flapping Detector using Sliding Window State Transitions
 */
class FlappingDetector {
  constructor(windowMs = 60000, threshold = 4) {
    this.windowMs = windowMs;
    this.threshold = threshold;
    this.transitions = []; // timestamps of state changes
  }

  recordTransition() {
    const now = Date.now();
    this.transitions.push(now);
    this.prune();
    return this.isFlapping();
  }

  prune() {
    const cutoff = Date.now() - this.windowMs;
    this.transitions = this.transitions.filter(t => t >= cutoff);
  }

  isFlapping() {
    this.prune();
    return this.transitions.length >= this.threshold;
  }
}

/**
 * Target Endpoint Monitor
 */
class TargetEndpoint {
  constructor(config) {
    this.id = config.id || ('target_' + crypto.randomBytes(4).toString('hex'));
    this.name = config.name || this.id;
    this.protocol = (config.protocol || 'HTTP').toUpperCase(); // 'HTTP', 'TCP'
    this.host = config.host || '127.0.0.1';
    this.port = parseInt(config.port, 10) || (this.protocol === 'HTTP' ? 80 : 8080);
    this.path = config.path || '/health';
    this.expectedStatus = config.expectedStatus || 200;
    this.timeoutMs = config.timeoutMs || 3000;
    this.intervalSeconds = config.intervalSeconds || 10;

    this.status = 'HEALTHY'; // 'HEALTHY', 'DEGRADED', 'DOWN', 'FLAPPING'
    this.history = []; // last 50 probe results
    this.latencies = []; // last 100 latency values
    this.flappingDetector = new FlappingDetector();

    this.stats = {
      totalProbes: 0,
      successfulProbes: 0,
      failedProbes: 0,
      consecutiveFailures: 0,
      uptimePercent: 100.0,
      lastProbeAt: null,
      lastHealthyAt: Date.now()
    };
  }

  recordResult(success, latencyMs, details = {}) {
    const prevStatus = this.status;
    this.stats.totalProbes++;
    this.stats.lastProbeAt = Date.now();

    if (success) {
      this.stats.successfulProbes++;
      this.stats.consecutiveFailures = 0;
      this.stats.lastHealthyAt = Date.now();
      this.latencies.push(latencyMs);
      if (this.latencies.length > 100) this.latencies.shift();

      if (this.status !== 'HEALTHY') {
        this.status = 'HEALTHY';
        this.flappingDetector.recordTransition();
      }
    } else {
      this.stats.failedProbes++;
      this.stats.consecutiveFailures++;

      if (this.stats.consecutiveFailures >= 3) {
        this.status = 'DOWN';
      } else {
        this.status = 'DEGRADED';
      }

      if (prevStatus !== this.status) {
        this.flappingDetector.recordTransition();
      }
    }

    if (this.flappingDetector.isFlapping()) {
      this.status = 'FLAPPING';
    }

    this.stats.uptimePercent = parseFloat(((this.stats.successfulProbes / Math.max(1, this.stats.totalProbes)) * 100).toFixed(2));

    const resultFrame = {
      timestamp: Date.now(),
      success,
      latencyMs,
      status: this.status,
      details
    };

    this.history.unshift(resultFrame);
    if (this.history.length > 50) this.history.pop();

    return {
      statusChanged: prevStatus !== this.status,
      prevStatus,
      newStatus: this.status,
      resultFrame
    };
  }

  getMetrics() {
    return {
      id: this.id,
      name: this.name,
      protocol: this.protocol,
      target: `${this.host}:${this.port}${this.protocol === 'HTTP' ? this.path : ''}`,
      status: this.status,
      uptimePercent: this.stats.uptimePercent,
      percentiles: calculatePercentiles(this.latencies),
      totalProbes: this.stats.totalProbes,
      successfulProbes: this.stats.successfulProbes,
      failedProbes: this.stats.failedProbes,
      consecutiveFailures: this.stats.consecutiveFailures,
      lastProbeAt: this.stats.lastProbeAt,
      recentHistory: this.history.slice(0, 10)
    };
  }
}

/**
 * HealthProbeOrchestrator Engine
 */
class HealthProbeOrchestrator {
  constructor() {
    this.targets = new Map(); // id -> TargetEndpoint
    this.subscribers = new Set();
    this.totalProbesRun = 0;
    this.startTime = Date.now();

    this.seedDefaultTargets();
  }

  seedDefaultTargets() {
    this.addTarget({
      id: 'api_ingress',
      name: 'Primary Ingress API Gateway',
      protocol: 'HTTP',
      host: '127.0.0.1',
      port: 8080,
      path: '/api/health',
      expectedStatus: 200
    });

    this.addTarget({
      id: 'db_replica',
      name: 'PostgreSQL Standby Replica',
      protocol: 'TCP',
      host: '127.0.0.1',
      port: 5432
    });

    this.addTarget({
      id: 'redis_cache',
      name: 'Redis Cache L2',
      protocol: 'TCP',
      host: '127.0.0.1',
      port: 6379
    });

    this.addTarget({
      id: 'auth_service',
      name: 'Identity & JWT Auth Service',
      protocol: 'HTTP',
      host: '127.0.0.1',
      port: 8001,
      path: '/health',
      expectedStatus: 200
    });

    // Seed mock telemetry history for rich initial dashboard view
    for (const target of this.targets.values()) {
      for (let i = 0; i < 20; i++) {
        const isSuccess = Math.random() > 0.05;
        const fakeLatency = isSuccess ? Math.floor(5 + Math.random() * 25) : 0;
        target.recordResult(isSuccess, fakeLatency, { code: isSuccess ? 200 : 503 });
      }
    }
  }

  addTarget(config) {
    const target = new TargetEndpoint(config);
    this.targets.set(target.id, target);
    this.broadcastEvent('target_added', { id: target.id, name: target.name });
    return target;
  }

  removeTarget(id) {
    const res = this.targets.delete(id);
    if (res) this.broadcastEvent('target_removed', { id });
    return res;
  }

  /**
   * Executes a probe against a single target endpoint
   */
  async probeTarget(targetId) {
    const target = this.targets.get(targetId);
    if (!target) throw new Error(`Target ${targetId} not found`);

    const t0 = Date.now();
    let success = false;
    let latencyMs = 0;
    let details = {};

    if (target.protocol === 'HTTP') {
      try {
        const res = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('ETIMEDOUT')), target.timeoutMs);
          const req = http.request({
            hostname: target.host,
            port: target.port,
            path: target.path,
            method: 'GET',
            timeout: target.timeoutMs
          }, (resp) => {
            clearTimeout(timer);
            resolve({ statusCode: resp.statusCode });
          });
          req.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
          req.end();
        });

        latencyMs = Date.now() - t0;
        success = res.statusCode === target.expectedStatus;
        details = { statusCode: res.statusCode, expectedStatus: target.expectedStatus };
      } catch (err) {
        latencyMs = Date.now() - t0;
        success = false;
        details = { error: err.message };
      }
    } else if (target.protocol === 'TCP') {
      try {
        await new Promise((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(target.timeoutMs);
          socket.on('connect', () => {
            socket.destroy();
            resolve();
          });
          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('ETIMEDOUT'));
          });
          socket.on('error', (err) => {
            socket.destroy();
            reject(err);
          });
          socket.connect(target.port, target.host);
        });

        latencyMs = Date.now() - t0;
        success = true;
        details = { connected: true };
      } catch (err) {
        latencyMs = Date.now() - t0;
        success = false;
        details = { error: err.message };
      }
    }

    const outcome = target.recordResult(success, latencyMs, details);
    this.totalProbesRun++;

    this.broadcastEvent('probe_executed', {
      targetId: target.id,
      success,
      latencyMs,
      status: target.status,
      statusChanged: outcome.statusChanged
    });

    return outcome;
  }

  /**
   * Executes synthetic probe sweep across all registered targets
   */
  async probeAll() {
    const promises = Array.from(this.targets.keys()).map(id => this.probeTarget(id));
    const results = await Promise.allSettled(promises);
    return results;
  }

  subscribe(res) {
    this.subscribers.add(res);
    res.on('close', () => this.subscribers.delete(res));
  }

  broadcastEvent(eventType, payload) {
    const data = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of this.subscribers) {
      try { res.write(data); } catch (e) { this.subscribers.delete(res); }
    }
  }

  metrics() {
    const allMetrics = Array.from(this.targets.values()).map(t => t.getMetrics());
    const healthyCount = allMetrics.filter(t => t.status === 'HEALTHY').length;
    const degradedCount = allMetrics.filter(t => t.status === 'DEGRADED').length;
    const downCount = allMetrics.filter(t => t.status === 'DOWN').length;

    let totalLatency = 0;
    let latencyCount = 0;
    for (const t of allMetrics) {
      if (t.percentiles.avg > 0) {
        totalLatency += t.percentiles.avg;
        latencyCount++;
      }
    }

    return {
      totalTargets: this.targets.size,
      healthyTargets: healthyCount,
      degradedTargets: degradedCount,
      downTargets: downCount,
      totalProbesRun: this.totalProbesRun,
      avgLatencyMs: latencyCount > 0 ? parseFloat((totalLatency / latencyCount).toFixed(2)) : 0,
      subscribers: this.subscribers.size,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      targets: allMetrics
    };
  }
}

module.exports = {
  calculatePercentiles,
  FlappingDetector,
  TargetEndpoint,
  HealthProbeOrchestrator
};
