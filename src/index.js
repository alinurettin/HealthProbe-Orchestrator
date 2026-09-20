// HealthProbe-Orchestrator v2.0.0 - Production HTTP Server & Telemetry Gateway
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { HealthProbeOrchestrator } = require('./engine');

const orchestrator = new HealthProbeOrchestrator();
const PORT = parseInt(process.env.PORT, 10) || 6015;
const publicDir = path.join(__dirname, '..', 'public');
const startTime = Date.now();

function requestHandler(req, res) {
  const reqUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = reqUrl.pathname;

  // CORS Headers
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    });
    return res.end();
  }

  // SSE Live Stream Endpoint
  if (req.method === 'GET' && pathname === '/api/events/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');

    const initData = JSON.stringify({
      type: 'INIT',
      metrics: orchestrator.metrics(),
      timestamp: Date.now()
    });
    res.write(`event: init\ndata: ${initData}\n\n`);

    orchestrator.subscribe(res);
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    const jsonRes = (statusCode, data) => {
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(data));
    };

    // 1. Health API
    if (pathname === '/api/health') {
      return jsonRes(200, {
        status: 'UP',
        service: 'HealthProbe-Orchestrator',
        version: '2.0.0',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      });
    }

    // 2. Stats & Telemetry API
    if (pathname === '/api/stats') {
      return jsonRes(200, {
        success: true,
        service: 'HealthProbe-Orchestrator',
        version: '2.0.0',
        metrics: orchestrator.metrics()
      });
    }

    // 3. Targets List API
    if (req.method === 'GET' && pathname === '/api/targets') {
      const targets = Array.from(orchestrator.targets.values()).map(t => t.getMetrics());
      return jsonRes(200, { success: true, targets });
    }

    // 4. Add Target API
    if (req.method === 'POST' && pathname === '/api/targets') {
      try {
        const data = JSON.parse(body || '{}');
        const target = orchestrator.addTarget(data);
        return jsonRes(200, { success: true, target: target.getMetrics() });
      } catch (err) {
        return jsonRes(400, { success: false, error: err.message });
      }
    }

    // 5. Delete Target API
    const deleteMatch = pathname.match(/^\/api\/targets\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      const targetId = deleteMatch[1];
      const removed = orchestrator.removeTarget(targetId);
      return jsonRes(200, { success: removed, targetId });
    }

    // 6. Trigger Probe Sweep API
    if (req.method === 'POST' && pathname === '/api/probe/sweep') {
      try {
        const results = await orchestrator.probeAll();
        return jsonRes(200, { success: true, totalExecuted: results.length, metrics: orchestrator.metrics() });
      } catch (err) {
        return jsonRes(500, { success: false, error: err.message });
      }
    }

    // 7. Single Target Probe API
    const singleProbeMatch = pathname.match(/^\/api\/probe\/([^/]+)$/);
    if (req.method === 'POST' && singleProbeMatch) {
      try {
        const targetId = singleProbeMatch[1];
        const outcome = await orchestrator.probeTarget(targetId);
        return jsonRes(200, { success: true, outcome });
      } catch (err) {
        return jsonRes(400, { success: false, error: err.message });
      }
    }

    // 8. Static Web UI Files
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      return res.end(fs.readFileSync(filePath));
    }

    jsonRes(404, { error: 'Endpoint not found' });
  });
}

function startServer(portToUse = PORT, callback) {
  const server = http.createServer(requestHandler);
  server.listen(portToUse, callback);
  return server;
}

if (require.main === module) {
  startServer(PORT, () => {
    console.log(`⚡ HealthProbe-Orchestrator v2.0.0 running on http://localhost:${PORT}`);
  });
}

module.exports = { startServer, orchestrator };
