// HealthProbe-Orchestrator v2.0.0 - Interactive Dashboard Controller
document.addEventListener('DOMContentLoaded', () => {
  const kpiTotalTargets = document.getElementById('kpiTotalTargets');
  const kpiHealthy = document.getElementById('kpiHealthy');
  const kpiHealthyPct = document.getElementById('kpiHealthyPct');
  const kpiDegraded = document.getElementById('kpiDegraded');
  const kpiDown = document.getElementById('kpiDown');
  const kpiAvgLatency = document.getElementById('kpiAvgLatency');
  const kpiTotalProbes = document.getElementById('kpiTotalProbes');

  const sseStatus = document.getElementById('sseStatus');
  const sseLabel = document.getElementById('sseLabel');
  const btnSweep = document.getElementById('btnSweep');
  const endpointsList = document.getElementById('endpointsList');
  const feedContainer = document.getElementById('feedContainer');

  const btnToggleAdd = document.getElementById('btnToggleAdd');
  const btnCancelAdd = document.getElementById('btnCancelAdd');
  const addTargetBox = document.getElementById('addTargetBox');
  const newTargetForm = document.getElementById('newTargetForm');
  const targetProtocol = document.getElementById('targetProtocol');
  const pathGroup = document.getElementById('pathGroup');

  let targetsData = [];

  // Toggle form
  btnToggleAdd.addEventListener('click', () => {
    addTargetBox.style.display = addTargetBox.style.display === 'none' ? 'block' : 'none';
  });
  btnCancelAdd.addEventListener('click', () => {
    addTargetBox.style.display = 'none';
  });

  targetProtocol.addEventListener('change', () => {
    if (targetProtocol.value === 'TCP') {
      pathGroup.style.display = 'none';
    } else {
      pathGroup.style.display = 'flex';
    }
  });

  // Handle New Target Form Submission
  newTargetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      id: document.getElementById('targetId').value.trim(),
      name: document.getElementById('targetName').value.trim(),
      protocol: targetProtocol.value,
      host: document.getElementById('targetHost').value.trim(),
      port: parseInt(document.getElementById('targetPort').value, 10),
      path: document.getElementById('targetPath').value.trim() || '/health'
    };

    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        newTargetForm.reset();
        addTargetBox.style.display = 'none';
        refreshData();
      } else {
        alert('Failed to add target: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error connecting to backend: ' + err.message);
    }
  });

  // Trigger Fleet Sweep
  btnSweep.addEventListener('click', async () => {
    btnSweep.disabled = true;
    btnSweep.innerHTML = '<span class="btn-icon">⏳</span> Probing Fleet...';
    try {
      await fetch('/api/probe/sweep', { method: 'POST' });
      await refreshData();
    } catch (err) {
      console.error('Sweep failed:', err);
    } finally {
      btnSweep.disabled = false;
      btnSweep.innerHTML = '<span class="btn-icon">▶</span> Trigger Fleet Sweep';
    }
  });

  // Fetch initial telemetry
  async function refreshData() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success && data.metrics) {
        updateDashboard(data.metrics);
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  }

  function updateDashboard(metrics) {
    kpiTotalTargets.textContent = metrics.totalTargets;
    kpiHealthy.textContent = metrics.healthyTargets;
    const pct = metrics.totalTargets > 0
      ? ((metrics.healthyTargets / metrics.totalTargets) * 100).toFixed(1)
      : 100;
    kpiHealthyPct.textContent = `${pct}% operational SLA`;
    kpiDegraded.textContent = metrics.degradedTargets;
    kpiDown.textContent = metrics.downTargets;
    kpiAvgLatency.innerHTML = `${metrics.avgLatencyMs} <span class="unit">ms</span>`;
    kpiTotalProbes.textContent = metrics.totalProbesRun.toLocaleString();

    targetsData = metrics.targets || [];
    renderEndpoints(targetsData);
  }

  function renderEndpoints(targets) {
    if (targets.length === 0) {
      endpointsList.innerHTML = '<div class="feed-empty">No synthetic targets registered.</div>';
      return;
    }

    endpointsList.innerHTML = targets.map(t => {
      const p = t.percentiles || { p50: 0, p90: 0, p95: 0, p99: 0 };
      const historyBars = (t.recentHistory || []).map(h => {
        const height = Math.min(28, Math.max(4, Math.round((h.latencyMs / 50) * 28)));
        return `<div class="spark-bar ${h.success ? '' : 'fail'}" style="height: ${height}px;" title="${h.latencyMs}ms"></div>`;
      }).reverse().join('');

      return `
        <div class="target-card" data-id="${t.id}">
          <div class="target-main-row">
            <div class="target-info">
              <span class="proto-badge ${t.protocol}">${t.protocol}</span>
              <div>
                <div class="target-title">${escapeHtml(t.name)}</div>
                <div class="target-uri">${escapeHtml(t.target)}</div>
              </div>
            </div>
            <div class="target-status-group">
              <span class="status-badge ${t.status}">${t.status}</span>
            </div>
          </div>

          <div class="target-metrics-row">
            <div class="metric-cell">
              <span class="cell-lbl">UPTIME</span>
              <span class="cell-val">${t.uptimePercent}%</span>
            </div>
            <div class="metric-cell">
              <span class="cell-lbl">p50 MEDIAN</span>
              <span class="cell-val">${p.p50} ms</span>
            </div>
            <div class="metric-cell">
              <span class="cell-lbl">p95 SLA</span>
              <span class="cell-val">${p.p95} ms</span>
            </div>
            <div class="metric-cell">
              <span class="cell-lbl">p99 TAIL</span>
              <span class="cell-val">${p.p99} ms</span>
            </div>
            <div class="metric-cell">
              <span class="cell-lbl">PROBES</span>
              <span class="cell-val">${t.successfulProbes}/${t.totalProbes}</span>
            </div>
          </div>

          <div class="sparkline-container">
            ${historyBars || '<span style="font-size: 11px; color: var(--text-muted);">No history recorded yet</span>'}
          </div>

          <div class="target-actions">
            <button class="btn btn-secondary btn-sm btn-probe-single" data-id="${t.id}">⚡ Probe Now</button>
            <button class="btn btn-secondary btn-sm btn-delete" data-id="${t.id}" style="color: var(--accent-rose);">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach actions
    document.querySelectorAll('.btn-probe-single').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          await fetch(`/api/probe/${id}`, { method: 'POST' });
          await refreshData();
        } catch (e) {
          console.error(e);
        } finally {
          btn.disabled = false;
        }
      });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm(`Are you sure you want to remove ${id}?`)) return;
        try {
          await fetch(`/api/targets/${id}`, { method: 'DELETE' });
          await refreshData();
        } catch (e) {
          console.error(e);
        }
      });
    });
  }

  function appendFeedItem(item) {
    const emptyMsg = feedContainer.querySelector('.feed-empty');
    if (emptyMsg) emptyMsg.remove();

    const div = document.createElement('div');
    div.className = `feed-item ${item.success ? 'success' : 'fail'}`;
    const timeStr = new Date().toLocaleTimeString();

    div.innerHTML = `
      <div class="feed-item-top">
        <span class="feed-target">${escapeHtml(item.targetId || 'fleet')}</span>
        <span class="feed-time">${timeStr}</span>
      </div>
      <div class="feed-item-details">
        <span>Status: <strong>${item.status || (item.success ? 'HEALTHY' : 'DOWN')}</strong></span>
        <span class="feed-latency">${item.latencyMs !== undefined ? item.latencyMs + ' ms' : ''}</span>
      </div>
    `;

    feedContainer.prepend(div);
    // Keep max 30 items
    while (feedContainer.children.length > 30) {
      feedContainer.removeChild(feedContainer.lastChild);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Connect to SSE Stream
  function initSSE() {
    const evtSource = new EventSource('/api/events/stream');

    evtSource.addEventListener('init', (e) => {
      sseLabel.textContent = 'SSE Live Stream Connected';
      const parsed = JSON.parse(e.data);
      if (parsed.metrics) updateDashboard(parsed.metrics);
    });

    evtSource.addEventListener('probe_executed', (e) => {
      const data = JSON.parse(e.data);
      appendFeedItem(data);
      refreshData();
    });

    evtSource.addEventListener('target_added', () => refreshData());
    evtSource.addEventListener('target_removed', () => refreshData());

    evtSource.onopen = () => {
      sseLabel.textContent = 'SSE Live Connected';
    };

    evtSource.onerror = () => {
      sseLabel.textContent = 'SSE Reconnecting...';
    };
  }

  // Initial load
  refreshData();
  initSSE();
});
