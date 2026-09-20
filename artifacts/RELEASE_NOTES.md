# 🚀 Release Notes: HealthProbe-Orchestrator v2.0.0
- **Release Version:** 2.0.0
- **Release Date:** 2026-09-20
- **Author:** Ali Nurettin Demir & The Autonomous 7-Agent SDLC Factory

---

## 🌟 Major Improvements & Architectural Advancements

### 1. Mathematical Nearest-Rank Percentile Engine
Replaced simplistic arithmetic averages with an exact Nearest-Rank percentile distribution algorithm ($p50, p90, p95, p99$). Accurately detects tail latency degradation and SLA violations without interpolation distortion.

### 2. Sliding-Window Flapping Detection Hysteresis
Introduced time-windowed state transition tracking. Eliminates alert storms by isolating nodes transitioning $\ge 4$ times within 60 seconds into a protected `FLAPPING` state.

### 3. Multi-Protocol Synthetic Probing
Added simultaneous support for Layer 7 HTTP/HTTPS status validation and Layer 4 raw TCP 3-way handshake verification with millisecond-resolution timers.

### 4. Zero-Dependency Real-Time SSE Stream
Built-in native Server-Sent Events gateway broadcasting probe executions, status shifts, and target mutations directly to reactive dashboard listeners.

### 5. Cyber Dark-Mode Operations Console
Designed a modern responsive interface in `public/` featuring live KPI summary cards, target fleet controls, latency sparkline histograms, and real-time activity event logs.

### 6. 100% Non-Mock Verification Suite
Implemented an exhaustive 28-assertion test suite in `tests/run_tests.js` executing against live ephemeral operating system sockets.
