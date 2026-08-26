/**
 * Example resource server — batch-settlement on Base Sepolia.
 * Public demo points FACILITATOR_URL at https://facilitator.batchrail.io
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { privateKeyToAccount } from "viem/accounts";

import { HTTPFacilitatorClient } from "@x402/core/server";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/server";
import { FileChannelStorage } from "@x402/evm/batch-settlement/server/file-storage";
import {
  paymentMiddlewareFromHTTPServer,
  setSettlementOverrides,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/express";

const NETWORK = "eip155:84532" as const;
const PORT = Number(process.env.PORT ?? process.env.RESOURCE_PORT ?? 4021);

const evmAddress = process.env.EVM_ADDRESS as `0x${string}` | undefined;
const facilitatorUrl =
  process.env.FACILITATOR_URL ?? "https://facilitator.batchrail.io";
const storageDir = process.env.CHANNEL_STORAGE_DIR ?? "./channels";
const withdrawDelay = Number(process.env.DEFERRED_WITHDRAW_DELAY_SECONDS ?? "86400");

if (!evmAddress || !/^0x[0-9a-fA-F]{40}$/.test(evmAddress)) {
  console.error(
    "Missing or invalid EVM_ADDRESS\n" +
      "This is YOUR payTo address that receives settled test USDC (does not need ETH)."
  );
  process.exit(1);
}

const authorizerKey = process.env.EVM_RECEIVER_AUTHORIZER_PRIVATE_KEY as
  | `0x${string}`
  | undefined;
const receiverAuthorizerSigner = authorizerKey
  ? privateKeyToAccount(authorizerKey)
  : undefined;

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const batchScheme = new BatchSettlementEvmScheme(evmAddress, {
  ...(receiverAuthorizerSigner ? { receiverAuthorizerSigner } : {}),
  withdrawDelay,
  storage: new FileChannelStorage({ directory: storageDir }),
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  batchScheme
);

const channelManager = batchScheme.createChannelManager(facilitatorClient, NETWORK);
channelManager.start({
  claimIntervalSecs: Number(process.env.CLAIM_INTERVAL_SECS ?? 60),
  settleIntervalSecs: Number(process.env.SETTLE_INTERVAL_SECS ?? 120),
  refundIntervalSecs: Number(process.env.REFUND_INTERVAL_SECS ?? 180),
  maxClaimsPerBatch: Number(process.env.MAX_CLAIMS_PER_BATCH ?? 50),
  onClaim: (r: { vouchers: number; transaction: string }) =>
    console.log(`[claim] ${r.vouchers} vouchers  tx=${r.transaction}`),
  onSettle: (r: { transaction: string }) =>
    console.log(`[settle] → ${evmAddress}  tx=${r.transaction}`),
  onRefund: (r: { channel: string; transaction: string }) =>
    console.log(`[refund] channel ${r.channel}  tx=${r.transaction}`),
  onError: (e: unknown) => console.error("[channel-manager]", e),
});

process.on("SIGINT", async () => {
  console.log("Shutting down — flushing pending claims…");
  await channelManager.stop({ flush: true });
  process.exit(0);
});

const app = express();

// Railway / reverse proxies: use X-Forwarded-* so resource URLs are https://
app.set("trust proxy", 1);

// Browser clients need to read x402 payment headers on 402 / 200 responses
app.use(
  cors({
    origin: true,
    credentials: false,
    methods: ["GET", "POST", "OPTIONS", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "PAYMENT-SIGNATURE",
      "PAYMENT-REQUIRED",
      "PAYMENT-RESPONSE",
      "X-PAYMENT",
      "X-PAYMENT-RESPONSE",
      "payment-signature",
      "payment-required",
      "payment-response",
    ],
    exposedHeaders: [
      "PAYMENT-REQUIRED",
      "PAYMENT-RESPONSE",
      "PAYMENT-SIGNATURE",
      "X-PAYMENT",
      "X-PAYMENT-RESPONSE",
      "payment-required",
      "payment-response",
      "payment-signature",
    ],
  })
);

const maxPrice = "$0.01";

const httpServer = new x402HTTPResourceServer(resourceServer, {
  "GET /weather": {
    accepts: {
      scheme: "batch-settlement",
      price: maxPrice,
      network: NETWORK,
      payTo: evmAddress,
    },
    description: "Weather data (BatchRail public testnet demo)",
    mimeType: "application/json",
  },
});

async function main() {
  await httpServer.initialize();

  app.use(paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false));

  // Unpaid health for Railway probes
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "batchrail-example-server",
      network: NETWORK,
      facilitator: facilitatorUrl,
      payTo: evmAddress,
      resource: "GET /weather",
    });
  });

  app.get("/weather", (_req, res) => {
    const chargedPercent = 1 + Math.floor(Math.random() * 100);
    setSettlementOverrides(res, { amount: `${chargedPercent}%` });

    res.json({
      report: {
        weather: "sunny",
        temperature: 70 + Math.floor(Math.random() * 10),
      },
      charged: `${chargedPercent}% of ${maxPrice}`,
      network: "eip155:84532",
      note: "Base Sepolia testnet demo — Capt. Riker / BatchRail",
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("  BatchRail example resource server");
    console.log("  ─────────────────────────────────────");
    console.log(`  Port         ${PORT}`);
    console.log(`  Resource     GET /weather  (batch-settlement, max ${maxPrice})`);
    console.log(`  payTo        ${evmAddress}`);
    console.log(`  Facilitator  ${facilitatorUrl}`);
    console.log(
      `  Authorizer   ${receiverAuthorizerSigner ? receiverAuthorizerSigner.address + " (local)" : "facilitator-delegated"}`
    );
    console.log("  trust proxy  on (HTTPS resource URLs behind Railway)");
    console.log("");
  });
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
