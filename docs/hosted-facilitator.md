# Hosted facilitator (Base Sepolia)

Public test endpoint for BatchRail’s x402 facilitator.

**Base URL:** https://facilitator.batchrail.io  
**Maintainer (public):** Capt. Riker · [@BatchRail](https://x.com/BatchRail)

## Important notes

- **Testnet only** — Base Sepolia (`eip155:84532`)
- **No API key required** for the current public demo
- The **facilitator wallet pays gas** for on-chain deposit / claim / settle / refund relays
- Do not send mainnet funds or production secrets to this endpoint

## Try a paid call (testnet)

Live example resource (no repo clone required):

| Path | URL |
|------|-----|
| Health | https://demo-resource-production.up.railway.app/health |
| Paid route | https://demo-resource-production.up.railway.app/weather |

- A **normal browser** on `/weather` will see **HTTP 402 Payment Required** (x402). That is expected.
- An **x402 client** pays with **Base Sepolia test USDC** (batch-settlement), then retries and receives a small JSON weather payload.
- Facilitator used by this demo: https://facilitator.batchrail.io  
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

## Endpoints

| Method | Path | Purpose |
|--------|------|--------|
| `GET` | [/health](https://facilitator.batchrail.io/health) | Liveness |
| `GET` | [/stats](https://facilitator.batchrail.io/stats) | Public usage counters |
| `GET` | [/supported](https://facilitator.batchrail.io/supported) | Schemes & networks |
| `POST` | `/verify` | Verify payment payload |
| `POST` | `/settle` | On-chain settle actions |

---

## 1. Minimal Express — one protected route

Copy-paste shape for a normal HTTP seller (bot or API):

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
          // price in atomic USDC units — keep tiny on testnet
          maxAmountRequired: "10000", // e.g. 0.01 USDC if 6 decimals
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

Package names follow official `@x402/*` SDKs. Full runnable loop: [BatchRail/core examples](https://github.com/BatchRail/core).

---

## 2. MCP / agent-tool sellers — one paid endpoint

Same facilitator URL. Treat your tool HTTP handler like any x402 resource:

```ts
// Inside your MCP tool HTTP adapter or standalone paid route
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "https://facilitator.batchrail.io";
const NETWORK = "eip155:84532"; // testnet only
const payTo = process.env.EVM_ADDRESS; // your receive address

// When an agent calls your tool:
// 1) Respond 402 with payment requirements (batch-settlement + NETWORK + payTo)
// 2) On retry with payment payload, POST verify/settle via FACILITATOR_URL
// 3) Then run the tool and return the result

// Env for the seller process:
//   FACILITATOR_URL=https://facilitator.batchrail.io
//   EVM_ADDRESS=0xYourAddress
```

**Warning:** Base Sepolia testnet only. No mainnet. Test USDC only. Do not put production keys in a public demo client.

Wire the official `BatchSettlementEvmScheme` + `HTTPFacilitatorClient` the same way as the Express example; only the outer “tool” wrapper differs.

---

## Optional API key

Public demo currently has **no** API key. If an operator later sets `API_KEY`, send `X-API-Key` or `Authorization: Bearer …`. `/health` and `/stats` stay open.

## Gas and funds

| Who | Needs |
|-----|--------|
| Facilitator (BatchRail) | Gas on Sepolia (operator-funded) |
| Your `EVM_ADDRESS` | Nothing required to receive settled test USDC |
| Paying client / agent | Base Sepolia USDC to open a channel |

Questions: [@BatchRail](https://x.com/BatchRail) (Capt. Riker).
