# Hosted facilitator (Base Sepolia)

Public test endpoint for BatchRail’s x402 facilitator.

**Facilitator (the rail):** https://facilitator.batchrail.io  
**Demo seller (paid weather):** https://demo-resource-production.up.railway.app/weather  
**Maintainer (public):** Capt. Riker · [@BatchRail](https://x.com/BatchRail)

There is **no** `/weather` on the facilitator. The facilitator only verifies and settles. The demo resource is a separate example seller.

## Important notes

- **Testnet only** — Base Sepolia (`eip155:84532`)
- **No API key required** for the current public demo
- The **facilitator wallet pays gas** on Sepolia for relayed txs. Mainnet fees are not set.
- Do not send mainnet funds or production secrets to this endpoint
- Do not call `https://facilitator.batchrail.io/weather`
- Cache `GET /supported` (minutes, not every request). Limit is 120 req/min/IP; 429 body `{ "error": "rate_limit_exceeded" }` with `Retry-After: 60`.

## Exact vs batch-settlement

| | `exact` | `batch-settlement` |
|--|---------|--------------------|
| 402 field (x402 v2) | `amount` | `amount` (not the v1 name `maxAmountRequired`) |
| When USDC reaches `payTo` | On that request’s `POST /settle` | After the **seller** claims vouchers, then settles |
| ChannelManager required? | No | **Yes** — official `createChannelManager` (or equivalent job) against **your** durable channel state |
| First `/verify` enrols you on the rail? | n/a | **No.** The hosted facilitator does not sweep arbitrary `payTo`s |

Read `extra.receiverAuthorizer` from live [`/supported`](https://facilitator.batchrail.io/supported). Do not hardcode it.

On batch-settlement the scheme serves the resource after verify, before the voucher is claimed on-chain. Claim on a timer and when a buyer starts withdrawal (`WithdrawInitiated` on the contract — the rail does not stream that event). Advertise `withdrawDelay` well above your claim cadence (24h is conservative).

## Two public hosts

| Role | URL | What it is |
|------|-----|------------|
| Facilitator (rail) | https://facilitator.batchrail.io | `/health` `/supported` `/stats` `POST /verify` `POST /settle` |
| Demo resource (seller) | https://demo-resource-production.up.railway.app | `GET /weather` → HTTP **402** in a browser |

## Try a paid call (testnet)

Live example **seller** (no repo clone required):

| Path | URL |
|------|-----|
| Health | https://demo-resource-production.up.railway.app/health |
| Paid route | https://demo-resource-production.up.railway.app/weather |

- A **normal browser** on `/weather` will see **HTTP 402 Payment Required** (x402). That is expected.
- An **x402 client** pays with **Base Sepolia test USDC** (this demo uses batch-settlement), then retries and receives a small JSON weather payload.
- That seller points at the rail: https://facilitator.batchrail.io  
- **Testnet only.** No mainnet.

## Env vars (yours only)

```env
# Required for a seller resource server
FACILITATOR_URL=https://facilitator.batchrail.io
EVM_ADDRESS=0xYourReceiveAddressOnBaseSepolia

# Network constant in code (not always an env)
# eip155:84532
```

You do **not** need BatchRail’s private keys.  
`EVM_ADDRESS` is **your** pay-to address (receives settled test USDC).

USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Facilitator endpoints

| Method | Path | Purpose |
|--------|------|--------|
| `GET` | [/health](https://facilitator.batchrail.io/health) | Liveness |
| `GET` | [/stats](https://facilitator.batchrail.io/stats) | Public usage counters |
| `GET` | [/supported](https://facilitator.batchrail.io/supported) | Schemes on Base Sepolia only |
| `POST` | `/verify` | Verify payment payload |
| `POST` | `/settle` | Relay on-chain actions (exact transfer, or batch deposit/claim/settle/refund) |

`/supported` advertises **eip155:84532** only (`batch-settlement` + `exact`). Not mainnet.

`/health` fields: `status`, `service`, `network`, `address`, `receiverAuthorizer`, `apiKeyRequired`.  
`/stats` fields: `totalRequests`, `verifyCount`, `settleCount`, `supportedCount`, `rateLimitedCount`, `lastRequestAt`, `network`, `apiKeyRequired`. No keys, balances, or payer addresses.

---

## 1. Minimal Express — one protected route (batch)

Copy-paste shape. Run a ChannelManager against durable storage or vouchers will not reach `payTo`.

```ts
import express from "express";
import { paymentMiddlewareFromHTTP, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/server";

const NETWORK = "eip155:84532" as const; // Base Sepolia — testnet only
const payTo = process.env.EVM_ADDRESS as `0x${string}`;

const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL ?? "https://facilitator.batchrail.io",
});

const batchScheme = new BatchSettlementEvmScheme(payTo);
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  batchScheme
);

const app = express();

app.get(
  "/weather",
  paymentMiddlewareFromHTTP(
    {
      accept: [
        {
          scheme: "batch-settlement",
          network: NETWORK,
          payTo,
          amount: "10000",
          resource: "https://your-host.example/weather",
          description: "Test weather (Base Sepolia)",
          mimeType: "application/json",
        },
      ],
    },
    resourceServer
  ),
  (_req, res) => {
    res.json({ ok: true, note: "paid on Base Sepolia testnet" });
  }
);

app.listen(4021);
```

For `exact` only, register the exact EVM scheme and put `scheme: "exact"` in `accept` — no ChannelManager. Dual-scheme 402: include both objects in `accept` / `accepts`.

Package names follow official `@x402/*` SDKs. Full runnable loop: [BatchRail/core examples](https://github.com/BatchRail/core).

---

## 2. MCP / agent-tool sellers — one paid endpoint

Same facilitator URL. Treat your tool HTTP handler like any x402 resource:

```ts
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "https://facilitator.batchrail.io";
const NETWORK = "eip155:84532"; // testnet only
const payTo = process.env.EVM_ADDRESS; // your receive address

// When an agent calls your tool:
// 1) Respond 402 with payment requirements (scheme + NETWORK + payTo + amount)
// 2) On retry with payment payload, POST verify/settle via FACILITATOR_URL
// 3) Then run the tool and return the result
// batch-settlement still needs your ChannelManager / claim job
```

**Warning:** Base Sepolia testnet only. No mainnet. Test USDC only. Do not put production keys in a public demo client.

---

## Optional API key

Public demo currently has **no** API key. If an operator later sets `API_KEY`, send `X-API-Key` or `Authorization: Bearer …`. `/health` and `/stats` stay open.

## Gas and funds

| Who | Needs |
|-----|--------|
| Facilitator (BatchRail) | Gas on Sepolia (operator-funded) |
| Your `EVM_ADDRESS` | Nothing required to receive settled test USDC |
| Paying client / agent | Base Sepolia USDC (`exact`) or channel deposit (batch) |

Questions: [@BatchRail](https://x.com/BatchRail) (Capt. Riker).
