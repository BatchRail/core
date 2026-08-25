# BatchRail – Product Scope (Updated 25 Aug 2026)

## Vision

BatchRail is a managed Facilitator + Channel Manager as a Service for the x402 protocol, focused on making batch-settlement practical, low-risk, and scalable for high-volume micropayments between agents and services.

**One-liner:** A specialized x402 facilitator + managed channel layer that makes batch-settlement the default for high-volume micropayments, using AI risk scoring, automated bots, and optional LP-backed float so merchants capture nearly all GMV instead of losing 30–40% to per-settlement fees.

## Core Differentiator

While the basic x402 facilitator can be open-sourced, BatchRail’s value is the **hosted, production-grade service** with:

- Reliable batch-settlement at scale
- AI-powered risk scoring
- Automated bot operations
- LP float capital pools
- Merchant tooling and support

**Advanced features remain private / available only through the hosted offering.**

## Current Status

- Working local facilitator with official batch-settlement scheme (Base Sepolia)
- Example resource server protected by batch-settlement + ChannelManager
- Example client (open channel → vouchers → resource access)
- Landing page live at [batchrail.io](https://batchrail.io)

## Open vs Hosted Boundary

| Layer | Open-source (this repo) | Hosted-only / Private |
|-------|-------------------------|------------------------|
| Facilitator | Basic skeleton + batch-settlement wiring | Production multi-region, HA, rate limits, abuse protection |
| Channel Manager | File-storage example loops | Redis/Postgres, durable jobs, auto-scaling |
| Client / SDK helpers | Example client + prefer-batch helpers | Hardened SDKs, agent framework plugins |
| Risk | Static deposit multipliers (examples only) | **Grok-powered dynamic risk scoring** |
| Ops | Manual / example scripts | **Bot swarm** (monitor, claim, settle, refund, attestation) |
| Capital | N/A | **LP float pools** (shared fee revenue) |
| Merchant UX | None | Dashboard, analytics, API keys, billing |
| Compliance / KMS | .env keys for local demo | HSM/KMS, multi-sig, insurance, audit trails |

## Roadmap & Priorities (market-driven)

### Phase 1 – Solid Core (Now → 2–4 weeks)

- Stable local facilitator + Channel Manager
- Full end-to-end client (open channel → vouchers → resource access)
- Basic documentation and local demo
- Public `core` + `website` repos

### Phase 2 – Hosted MVP

- Deploy facilitator as public hosted service
- Simple merchant dashboard
- API authentication
- Base mainnet pilot
- Basic risk rules (deposit multipliers)

### Phase 3 – Differentiated Product  **[HOSTED-ONLY]**

- **Grok-powered dynamic risk scoring** (wallet / agent reputation, volume, anomaly signals)
- **Bot swarm** for monitoring, settlement, refunds, attestation
- **LP float pools** (capital providers share fees; merchants get near-instant float)
- Multi-chain support beyond Base
- Merchant analytics and alerting

### Phase 4 – Scale & Moat  **[HOSTED-ONLY]**

- High availability / multi-region hosting
- Advanced security, key management, compliance
- Enterprise / white-label options
- Deeper agent SDK integrations (frameworks, Bazaar, etc.)

## Production Hosting & Scaling Considerations  **[HOSTED-ONLY]**

- Hosting targets: Railway, Fly.io, Render, or AWS/GCP
- Move from file-based channel storage to Redis/Postgres
- Secrets management, monitoring, logging, alerting
- Horizontal scaling of facilitators and channel managers
- Rate limiting, abuse protection, DDoS mitigation
- Usage metering and billing for customers
- SLA and support processes

## Monetization (high level)

- Small % of settled volume (or low per-batch fee) undercutting $0.001 exact fees while profitable at scale
- Optional premium: higher credit limits, dedicated endpoints, compliance add-ons
- LP fee share on float pools **[HOSTED-ONLY]**

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Smart-contract bugs | Audits; stick to official x402 contracts |
| Key compromise | KMS / multi-sig in production **[HOSTED-ONLY]** |
| Chain congestion | Batching already reduces load; multi-chain later |
| Regulatory classification of LP pools / facilitator | Legal review before mainnet float **[HOSTED-ONLY]** |
| Low initial batch adoption | Pilot with high-volume x402 merchants; free migration credits |

## Tech stack (MVP)

- TypeScript / Node, pnpm workspaces
- Official `@x402/core`, `@x402/evm`, `@x402/fetch`, `@x402/express`
- Base Sepolia first (`eip155:84532`), Base mainnet next
- File channel storage locally → Redis/Postgres in hosted
- Express for facilitator + resource examples

## License note

Open examples and facilitator skeleton: MIT (see repo).
Hosted product IP (risk models, bots, LP, dashboards): proprietary.
