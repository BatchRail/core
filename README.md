# BatchRail Core

**x402 batch-settlement facilitator + managed channel layer**

Open-source local demo. Product overview: [batchrail.io](https://batchrail.io)

## What’s inside

| Package / folder | Role |
|------------------|------|
| `packages/facilitator` | Real x402 facilitator with **batch-settlement** + exact |
| `packages/channel-manager` | Standalone claim/settle worker (also embedded in example server) |
| `packages/sdk` | Small helpers |
| `examples/server` | Express resource server protected by batch-settlement |
| `examples/client` | Official-scheme client: deposit once → vouchers → resource |

## Prerequisites

- Node.js ≥ 20, pnpm ≥ 9
- Base Sepolia wallets:
  - **Facilitator key** — small amount of ETH for gas
  - **Client key (`EVM_PRIVATE_KEY`)** — Base Sepolia **USDC**  
    Token: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet  
  (USDC: use Circle faucet / bridge test USDC to Base Sepolia)

## Quick start — full payment loop

```bash
git clone https://github.com/BatchRail/core.git
cd core
pnpm install
cp .env.example .env
# edit .env — at minimum FACILITATOR_PRIVATE_KEY, EVM_ADDRESS, EVM_PRIVATE_KEY
```

**Terminal 1 — Facilitator**

```bash
pnpm --filter @batchrail/facilitator dev
```

**Terminal 2 — Example resource server**

```bash
pnpm --filter @batchrail/example-server dev
```

**Terminal 3 — Client (opens channel + sends vouchers)**

```bash
pnpm --filter @batchrail/example-client dev
```

Expected flow:
1. First request deposits USDC into the batch-settlement channel (on-chain, once).
2. Each request attaches a cumulative off-chain voucher.
3. Server verifies via facilitator and returns `/weather` JSON.
4. Server ChannelManager later claims vouchers and settles USDC to `EVM_ADDRESS`.

## Networks

| Network | CAIP-2 | Status |
|---------|--------|--------|
| Base Sepolia | eip155:84532 | Primary (demo) |
| Base | eip155:8453 | Planned |

## License

MIT
