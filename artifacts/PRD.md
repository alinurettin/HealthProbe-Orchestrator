# 📋 Product Requirements Document (PRD): HealthProbe-Orchestrator v2.0.0
- **Document Status:** APPROVED
- **Owner:** Principal Product Manager & SDLC Architect
- **Target Release:** v2.0.0
- **Date:** 2026-09-20

---

## 1. Product Vision & Goals

HealthProbe-Orchestrator v2.0.0 is an enterprise-grade synthetic probe orchestrator engineered to deliver real-time service health validation, multi-protocol SLA telemetry, and flapping-resistant failure mitigation across complex hybrid-cloud infrastructures.

### Key Objectives:
1. **Deterministic Accuracy:** Execute low-latency synthetic HTTP and TCP probes with millisecond-accurate timer resolution.
2. **Mathematical Rigor:** Replace basic arithmetic averages with Nearest-Rank percentile distribution metrics ($p50, p90, p95, p99$).
3. **Flapping Resilience:** Automatically detect and isolate oscillating services via sliding-window transition analysis.
4. **Live Observability:** Provide zero-dependency Server-Sent Events (SSE) streaming and a responsive dark-mode cyber operations console.

---

## 2. User Personas & Core Use Cases

### Personas:
- **Site Reliability Engineer (SRE):** Needs continuous synthetic monitoring of ingress gateways, database clusters, and cache nodes with immediate tail latency visibility.
- **DevOps / Platform Engineer:** Requires lightweight containerized health checking in microservice architectures with zero external cloud dependencies.
- **System Administrator:** Needs intuitive dark-mode operational dashboard with one-click fleet sweeps and instant target provisioning.

---

## 3. Functional Requirements (FR)

| Requirement ID | Description | Priority |
| :--- | :--- | :--- |
| **FR-01** | Multi-protocol synthetic probing support for Layer 7 HTTP/HTTPS (status code matching) and Layer 4 TCP (SYN/ACK socket handshake). | P0 (Must) |
| **FR-02** | Nearest-Rank percentile engine calculating exact $p50, p90, p95, p99$, min, max, and average latencies over bounded sample arrays. | P0 (Must) |
| **FR-03** | Three-tier state machine: `HEALTHY` (100% operational), `DEGRADED` (1-2 consecutive failures), `DOWN` (3+ consecutive failures). | P0 (Must) |
| **FR-04** | Sliding-window flapping detector transitioning oscillating nodes into `FLAPPING` state when $\ge 4$ transitions occur within 60 seconds. | P0 (Must) |
| **FR-05** | Memory-bounded ring buffers capping latency measurements to last 100 values and execution histories to last 50 entries per target. | P0 (Must) |
| **FR-06** | RESTful HTTP management endpoints for target CRUD operations and individual/fleet probe execution sweeps. | P0 (Must) |
| **FR-07** | Real-time Server-Sent Events (SSE) broadcasting probe completion and target lifecycle events to connected clients. | P1 (High) |
| **FR-08** | Cyber dark-mode operational dashboard rendering live KPI metric cards, target cards, sparklines, and live telemetry feeds. | P1 (High) |

---

## 4. Non-Functional Requirements (NFR)

- **NFR-01 (Zero Dependencies):** Core runtime must depend solely on Node.js standard libraries (`http`, `net`, `crypto`, `url`, `path`, `fs`).
- **NFR-02 (Performance):** Sub-millisecond internal processing overhead per probe execution.
- **NFR-03 (Resource Consumption):** Process memory footprint strictly capped under $35\text{MB}$ under full fleet probing.
- **NFR-04 (Verification):** 100% real socket non-mocked verification test suite passing 25+ assertions.
- **NFR-05 (Availability):** Graceful recovery from socket timeouts (`ETIMEDOUT`) and connection refusals (`ECONNREFUSED`) without uncaught exceptions.
- **NFR-06 (Portability):** Zero-configuration Docker packaging and multi-platform compatibility (Windows, Linux, macOS).
