# BatchRail Core

**x402 batch-settlement facilitator + managed channel layer**

This monorepo contains the core building blocks for BatchRail:

- `@batchrail/facilitator` — hosted `/supported`, `/verify`, `/settle` endpoints compatible with x402 v2 + batch-settlement
- `@batchrail/channel-manager` — background claim / settle / refund loops
- `@batchrail/sdk` — thin client helpers that prefer batch when volume justifies it
- `examples/` — runnable facilitator, resource server, and client on **Base Sepolia**

Built on the official `@x402/*` packages from [x402-foundation/x402](https://github.com/x402-foundation/x402).

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm`)
- A funded Base Sepolia wallet (ETH for gas + USDC for deposits)
  - Get test ETH: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
  - USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Quick start (local)

```bash
git clone https://github.com/BatchRail/core.git
cd core
pnpm install
cp .env.example .env
# edit .env — set FACILITATOR_PRIVATE_KEY, EVM_ADDRESS, EVM_PRIVATE_KEY
```

### 1. Start the facilitator

```bash
pnpm --filter @batchrail/facilitator dev
# → http://localhost:4022
# GET  /supported
# POST /verify
# POST /settle
```

### 2. Start an example resource server (in another terminal)

```bash
pnpm --filter @batchrail/example-server dev
# → http://localhost:4021
```

### 3. Run the example client

```bash
pnpm --filter @batchrail/example-client start
```

## Monorepo layout

```
packages/
  facilitator/       # HTTP facilitator service
  channel-manager/   # Claim/settle/refund worker
  sdk/               # Client + server helpers
examples/
  facilitator/       # Thin wrapper / entrypoint
  server/            # Express resource server with batch-settlement
  client/            # Fetch client using BatchSettlementEvmScheme
docs/
```

## Networks

| Network        | CAIP-2          | Status          |
|----------------|-----------------|-----------------|
| Base Sepolia   | eip155:84532    | Primary (MVP)   |
| Base           | eip155:8453     | Phase 2         |
| Other EVM      | —               | Phase 2+        |

## License

MIT
