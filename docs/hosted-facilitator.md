# Hosted facilitator (Base Sepolia)

Public test endpoint for BatchRail’s x402 facilitator.

**Base URL:** https://facilitator.batchrail.io

## Important notes

- **Testnet only** — Base Sepolia (`eip155:84532`)
- **No API key required** for the current public demo (unless the operator enables one)
- The **facilitator wallet pays gas** for on-chain deposit / claim / settle / refund relays
- Do not send mainnet funds or production secrets to this endpoint

## Quick setup

Point your resource server at the hosted facilitator:

```env
FACILITATOR_URL=https://facilitator.batchrail.io
```

Network to use in payment requirements:

```text
eip155:84532
```

## Endpoints

| Method | Path | Purpose |
|--------|------|--------|
| `GET` | [/health](https://facilitator.batchrail.io/health) | Liveness and basic service info |
| `GET` | [/stats](https://facilitator.batchrail.io/stats) | Public aggregate usage counters |
| `GET` | [/supported](https://facilitator.batchrail.io/supported) | Schemes and networks this facilitator supports |
| `POST` | `/verify` | Verify a payment payload (no gas) |
| `POST` | `/settle` | Submit on-chain settlement actions |

### `/health`

Returns JSON such as `{ "status": "ok", "network": "eip155:84532", ... }`.
Use this to confirm the service is up.

### `/stats`

Public usage snapshot (no keys, balances, or payer data):

- `totalRequests`, `verifyCount`, `settleCount`, `supportedCount`, `rateLimitedCount`
- `lastRequestAt`, `network`, `apiKeyRequired`

**Stats:** https://facilitator.batchrail.io/stats

### `/supported`

Lists supported payment kinds (e.g. `batch-settlement`, `exact`) for Base Sepolia.
Resource servers call this when initializing so they only offer schemes the facilitator can handle.

## Minimal resource server config

With the official x402 Express helpers:

```ts
import { HTTPFacilitatorClient } from "@x402/core/server";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/server";
import { x402ResourceServer } from "@x402/express";

const NETWORK = "eip155:84532" as const;
const payTo = process.env.EVM_ADDRESS as `0x${string}`;

const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL ?? "https://facilitator.batchrail.io",
});

const batchScheme = new BatchSettlementEvmScheme(payTo, {
  // optional: receiverAuthorizerSigner, storage, withdrawDelay
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  batchScheme
);
```

Protect a route with `scheme: "batch-settlement"`, `network: "eip155:84532"`, and your `payTo` address.

Full runnable examples: [github.com/BatchRail/core](https://github.com/BatchRail/core) (`examples/server`, `examples/client`).

## Optional API key

If the operator sets `API_KEY` on the facilitator, clients must send:

```http
X-API-Key: <key>
```

or

```http
Authorization: Bearer <key>
```

`/health` and `/stats` stay open for monitoring. When `API_KEY` is unset, the demo stays fully public.

## Gas and funds

- **Facilitator key** (operator-controlled): pays gas on Base Sepolia for relayed txs
- **Your `payTo` address**: receives settled USDC; does not need ETH
- **Client / payer wallet**: needs Base Sepolia USDC to open a channel

USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
