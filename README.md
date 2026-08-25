# BatchRail Core

**x402 batch-settlement facilitator + managed channel layer**

This monorepo contains the core building blocks for BatchRail, built on the official `@x402/*` packages.

## What’s inside

| Package / folder | Role |
|------------------|------|
| `packages/facilitator` | Real x402 facilitator with **batch-settlement** + exact schemes |
| `packages/channel-manager` | Standalone claim/settle/refund worker (also embedded in example server) |
| `packages/sdk` | Small helpers (prefer-batch heuristic) |
| `examples/server` | Express resource server protected by batch-settlement |
| `examples/client` | Minimal fetch client (skeleton → wire next) |

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm`)
- A **Base Sepolia** wallet with:
  - a little ETH for gas (facilitator key)
  - USDC for deposits (client key) — token `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

## Quick start

```bash
git clone https://github.com/BatchRail/core.git
cd core
pnpm install
cp .env.example .env
```

Edit `.env` and set at least:

```env
FACILITATOR_PRIVATE_KEY=0x...   # pays gas, relays claims
EVM_ADDRESS=0x...               # receives settled USDC (payTo)
EVM_PRIVATE_KEY=0x...           # client test wallet (for later)
FACILITATOR_URL=http://localhost:4022
```

Optional but recommended for local demos:

```env
# Either set this on the facilitator…
RECEIVER_AUTHORIZER_PRIVATE_KEY=0x...

# …or on the resource server (self-managed authorizer)
EVM_RECEIVER_AUTHORIZER_PRIVATE_KEY=0x...
```

### Terminal 1 — Facilitator

```bash
pnpm --filter @batchrail/facilitator dev
```

You should see:

```
BatchRail facilitator ready
  URL                 http://localhost:4022
  Schemes             batch-settlement, exact
```

Quick check:

```bash
curl -s http://localhost:4022/health | jq
curl -s http://localhost:4022/supported | jq
```

### Terminal 2 — Example resource server

```bash
pnpm --filter @batchrail/example-server dev
```

Protected endpoint: `GET http://localhost:4021/weather`

### Next

Wire the official client (`@x402/fetch` + `BatchSettlementEvmScheme` from `@x402/evm/batch-settlement/client`) so the example client can open a channel and send vouchers.

## Networks

| Network      | CAIP-2       | Status        |
|--------------|--------------|---------------|
| Base Sepolia | eip155:84532 | Primary (MVP) |
| Base         | eip155:8453  | Phase 2       |

## License

MIT
