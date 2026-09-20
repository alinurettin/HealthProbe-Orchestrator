// HealthProbe-Orchestrator v2.0.0 - Exhaustive Verification Suite
// Mathematical Percentiles, Flapping Detection, Real Socket Probing, and API Telemetry
const assert = require('assert');
const http = require('http');
const net = require('net');
const { calculatePercentiles, FlappingDetector, TargetEndpoint, HealthProbeOrchestrator } = require('../src/engine');
const { startServer } = require('../src/index');

console.log('====================================================');
console.log('🧪 Running Verification Suite: HealthProbe-Orchestrator v2.0.0');
console.log('====================================================');

let totalPassed = 0;
function pass(desc) {
  totalPassed++;
  console.log(`  ✓ [PASS ${totalPassed}] ${desc}`);
}

async function runAllTests() {
  // -------------------------------------------------------------
  // 1. Algorithmic Nearest-Rank Percentile & Statistics Engine
  // -------------------------------------------------------------
  console.log('\n[1/5] Testing Nearest-Rank Percentile Engine...');

  const emptyRes = calculatePercentiles([]);
  assert.strictEqual(emptyRes.p50, 0);
  assert.strictEqual(emptyRes.p99, 0);
  assert.strictEqual(emptyRes.avg, 0);
  pass('Zero-length array handles graceful fallback');

  // Exact dataset: 10 items [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const sampleData = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const pResult = calculatePercentiles(sampleData);
  // Nearest-Rank: ceil(50% * 10) - 1 = 4 -> index 4 -> 50
  assert.strictEqual(pResult.p50, 50);
  pass('Nearest-Rank p50 matches exact median value (50ms)');

  // ceil(90% * 10) - 1 = 8 -> 90
  assert.strictEqual(pResult.p90, 90);
  pass('Nearest-Rank p90 matches 9th decile (90ms)');

  // ceil(95% * 10) - 1 = 9 -> 100
  assert.strictEqual(pResult.p95, 100);
  pass('Nearest-Rank p95 matches 95th percentile rank (100ms)');

  // ceil(99% * 10) - 1 = 9 -> 100
  assert.strictEqual(pResult.p99, 100);
  pass('Nearest-Rank p99 matches 99th percentile rank (100ms)');

  assert.strictEqual(pResult.min, 10);
  assert.strictEqual(pResult.max, 100);
  assert.strictEqual(pResult.avg, 55.0);
  pass('Min (10), Max (100), and Arithmetic Mean (55.0) verified');

  // -------------------------------------------------------------
  // 2. Sliding-Window Flapping Detector Engine
  // -------------------------------------------------------------
  console.log('\n[2/5] Testing Sliding-Window Flapping Detector...');

  const flappingDetector = new FlappingDetector(500, 3); // 500ms window, threshold 3
  assert.strictEqual(flappingDetector.isFlapping(), false);
  pass('Flapping detector initializes in stable (non-flapping) state');

  flappingDetector.recordTransition();
  flappingDetector.recordTransition();
  assert.strictEqual(flappingDetector.isFlapping(), false);
  pass('Transition count under threshold does not trigger flapping');

  flappingDetector.recordTransition();
  assert.strictEqual(flappingDetector.isFlapping(), true);
  pass('Transition count meeting threshold (3) triggers FLAPPING status');

  // Wait for window expiration to test time-based pruning
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.strictEqual(flappingDetector.isFlapping(), false);
  pass('Expired sliding window prunes transitions back to stable state');

  // -------------------------------------------------------------
  // 3. TargetEndpoint Lifecycle & State Machine
  // -------------------------------------------------------------
  console.log('\n[3/5] Testing TargetEndpoint State Machine & Uptime...');

  const endpoint = new TargetEndpoint({
    id: 'test_node_1',
    name: 'Unit Test Node',
    protocol: 'HTTP',
    host: '127.0.0.1',
    port: 8080,
    path: '/live'
  });

  assert.strictEqual(endpoint.status, 'HEALTHY');
  assert.strictEqual(endpoint.stats.totalProbes, 0);
  pass('Endpoint initializes with healthy state and clean metrics');

  // Record 1st failure -> DEGRADED
  const resF1 = endpoint.recordResult(false, 15, { error: 'ECONNREFUSED' });
  assert.strictEqual(endpoint.status, 'DEGRADED');
  assert.strictEqual(resF1.statusChanged, true);
  assert.strictEqual(endpoint.stats.consecutiveFailures, 1);
  pass('Single probe failure transitions status to DEGRADED');

  // Record 2nd failure -> still DEGRADED
  endpoint.recordResult(false, 12, { error: 'ECONNREFUSED' });
  assert.strictEqual(endpoint.status, 'DEGRADED');
  assert.strictEqual(endpoint.stats.consecutiveFailures, 2);
  pass('Consecutive failure count reaches 2 while DEGRADED');

  // Record 3rd failure -> transitions to DOWN
  const resF3 = endpoint.recordResult(false, 20, { error: 'ETIMEDOUT' });
  assert.strictEqual(endpoint.status, 'DOWN');
  assert.strictEqual(resF3.newStatus, 'DOWN');
  assert.strictEqual(endpoint.stats.consecutiveFailures, 3);
  pass('3rd consecutive failure transitions status to DOWN');

  // Record successful probe -> recovers to HEALTHY
  const resRec = endpoint.recordResult(true, 8, { statusCode: 200 });
  assert.strictEqual(endpoint.status, 'HEALTHY');
  assert.strictEqual(endpoint.stats.consecutiveFailures, 0);
  assert.strictEqual(endpoint.stats.successfulProbes, 1);
  pass('Successful probe resets consecutive failures and recovers to HEALTHY');

  // Check metrics calculation & uptime
  const metrics = endpoint.getMetrics();
  assert.strictEqual(metrics.totalProbes, 4);
  assert.strictEqual(metrics.successfulProbes, 1);
  assert.strictEqual(metrics.failedProbes, 3);
  assert.strictEqual(metrics.uptimePercent, 25.0);
  pass('Uptime percentage math correctly computes 25.0% (1/4)');

  // Test ring buffer limits (latencies capped at 100, history at 50)
  for (let i = 0; i < 110; i++) {
    endpoint.recordResult(true, i + 1, { statusCode: 200 });
  }
  assert.strictEqual(endpoint.latencies.length, 100);
  assert.strictEqual(endpoint.history.length, 50);
  pass('Latency buffer capped at 100 and History buffer capped at 50');

  // -------------------------------------------------------------
  // 4. Live Socket Probing (Real HTTP & TCP Servers, Zero Mocks)
  // -------------------------------------------------------------
  console.log('\n[4/5] Testing Live Network Sockets Probing (Mock-Free)...');

  // Setup Ephemeral HTTP Target Server
  const dummyHttpServer = http.createServer((req, res) => {
    if (req.url === '/probe-ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    res.writeHead(500);
    res.end();
  });

  const httpPort = await new Promise(resolve => {
    dummyHttpServer.listen(0, '127.0.0.1', () => resolve(dummyHttpServer.address().port));
  });

  // Setup Ephemeral TCP Target Server
  const dummyTcpServer = net.createServer((sock) => {
    sock.end();
  });

  const tcpPort = await new Promise(resolve => {
    dummyTcpServer.listen(0, '127.0.0.1', () => resolve(dummyTcpServer.address().port));
  });

  const orchestrator = new HealthProbeOrchestrator();
  // Clear default seeded targets for pristine test isolation
  orchestrator.targets.clear();

  const httpTarget = orchestrator.addTarget({
    id: 'live_http_probe',
    name: 'Live HTTP Microservice',
    protocol: 'HTTP',
    host: '127.0.0.1',
    port: httpPort,
    path: '/probe-ok',
    expectedStatus: 200,
    timeoutMs: 1000
  });

  const tcpTarget = orchestrator.addTarget({
    id: 'live_tcp_probe',
    name: 'Live TCP Socket Service',
    protocol: 'TCP',
    host: '127.0.0.1',
    port: tcpPort,
    timeoutMs: 1000
  });

  const deadTarget = orchestrator.addTarget({
    id: 'live_dead_probe',
    name: 'Unreachable Port Target',
    protocol: 'TCP',
    host: '127.0.0.1',
    port: 59991, // Closed port
    timeoutMs: 300
  });

  // Run probe against live HTTP server
  const httpOutcome = await orchestrator.probeTarget('live_http_probe');
  assert.strictEqual(httpOutcome.resultFrame.success, true);
  assert.strictEqual(httpOutcome.newStatus, 'HEALTHY');
  assert(httpOutcome.resultFrame.latencyMs >= 0);
  pass('Live synthetic HTTP probe against ephemeral socket succeeded');

  // Run probe against live TCP server
  const tcpOutcome = await orchestrator.probeTarget('live_tcp_probe');
  assert.strictEqual(tcpOutcome.resultFrame.success, true);
  assert.strictEqual(tcpOutcome.newStatus, 'HEALTHY');
  pass('Live synthetic TCP handshake probe against ephemeral socket succeeded');

  // Run probe against closed port
  const deadOutcome = await orchestrator.probeTarget('live_dead_probe');
  assert.strictEqual(deadOutcome.resultFrame.success, false);
  assert.strictEqual(deadOutcome.newStatus, 'DEGRADED');
  pass('Live synthetic TCP probe against closed port failed gracefully as DEGRADED');

  // Execute sweep
  const sweepResults = await orchestrator.probeAll();
  assert.strictEqual(sweepResults.length, 3);
  assert.strictEqual(orchestrator.totalProbesRun, 6); // 3 direct + 3 in sweep
  pass('Full fleet probe sweep executed successfully across all targets');

  // -------------------------------------------------------------
  // 5. Production HTTP API Gateway & SSE Stream Integration
  // -------------------------------------------------------------
  console.log('\n[5/5] Testing Production HTTP API Gateway & SSE Streaming...');

  const apiServer = await new Promise(resolve => {
    const s = startServer(0, () => resolve(s));
  });
  const apiPort = apiServer.address().port;

  const makeReq = (options, postData) => new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: apiPort,
      ...options
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });

  // GET /api/health
  const healthRes = await makeReq({ path: '/api/health', method: 'GET' });
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual(healthRes.json.status, 'UP');
  assert.strictEqual(healthRes.json.service, 'HealthProbe-Orchestrator');
  pass('GET /api/health returned 200 UP status');

  // GET /api/stats
  const statsRes = await makeReq({ path: '/api/stats', method: 'GET' });
  assert.strictEqual(statsRes.status, 200);
  assert.strictEqual(statsRes.json.success, true);
  assert(statsRes.json.metrics.totalTargets >= 0);
  pass('GET /api/stats returned full orchestrator metrics summary');

  // GET /api/targets
  const targetsRes = await makeReq({ path: '/api/targets', method: 'GET' });
  assert.strictEqual(targetsRes.status, 200);
  assert(Array.isArray(targetsRes.json.targets));
  pass('GET /api/targets returned registered target array');

  // POST /api/targets
  const createRes = await makeReq({
    path: '/api/targets',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    id: 'dynamic_api_service',
    name: 'Dynamic Microservice Ingress',
    protocol: 'HTTP',
    host: '127.0.0.1',
    port: httpPort,
    path: '/probe-ok'
  });
  assert.strictEqual(createRes.status, 200);
  assert.strictEqual(createRes.json.target.id, 'dynamic_api_service');
  pass('POST /api/targets successfully registered new synthetic probe target');

  // POST /api/probe/:id
  const probeOneRes = await makeReq({
    path: '/api/probe/dynamic_api_service',
    method: 'POST'
  });
  assert.strictEqual(probeOneRes.status, 200);
  assert.strictEqual(probeOneRes.json.success, true);
  assert.strictEqual(probeOneRes.json.outcome.resultFrame.success, true);
  pass('POST /api/probe/:id executed targeted live probe');

  // DELETE /api/targets/:id
  const deleteRes = await makeReq({
    path: '/api/targets/dynamic_api_service',
    method: 'DELETE'
  });
  assert.strictEqual(deleteRes.status, 200);
  assert.strictEqual(deleteRes.json.success, true);
  pass('DELETE /api/targets/:id deregistered target endpoint');

  // Test SSE Stream Handshake
  const sseHandshake = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: apiPort,
      path: '/api/events/stream',
      method: 'GET'
    }, (res) => {
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'text/event-stream');
      res.on('data', chunk => {
        const text = chunk.toString();
        if (text.includes('event: init')) {
          req.destroy();
          resolve(true);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
  assert.strictEqual(sseHandshake, true);
  pass('GET /api/events/stream initialized Server-Sent Events real-time stream');

  // Teardown Servers
  await new Promise(resolve => dummyHttpServer.close(resolve));
  await new Promise(resolve => dummyTcpServer.close(resolve));
  await new Promise(resolve => apiServer.close(resolve));

  console.log('\n====================================================');
  console.log(`🎉 ALL ${totalPassed} ASSERTIONS PASSED WITH ZERO MOCKS! (100% SUCCESS)`);
  console.log('====================================================\n');
  process.exit(0);
}

runAllTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
