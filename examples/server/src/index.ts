/**
 * Example resource server protected by the real batch-settlement scheme.
 *
 * Flow:
 * 1. Client hits GET /weather
 * 2. Middleware returns 402 with batch-settlement requirements
 * 3. Client deposits (once) + sends a voucher
 * 4. Middleware verifies via our facilitator, then serves the resource
 * 5. ChannelManager periodically claims vouchers and settles USDC to EVM_ADDRESS
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
const PORT = 4021;

const evmAddress = process.env.EVM_ADDRESS as `0x${string}` | undefined;
const facilitatorUrl = process.env.FACILITATOR_URL ?? "http://localhost:4022";
const storageDir = process.env.CHANNEL_STORAGE_DIR ?? "./channels";
const withdrawDelay = Number(process.env.DEFERRED_WITHDRAW_DELAY_SECONDS ?? "86400");

if (!evmAddress || !/^0x[0-9a-fA-F]{40}$/.test(evmAddress)) {
  console.error(
    "Missing or invalid EVM_ADDRESS in .env\n" +
      "This is the payTo address that receives settled USDC (does not need ETH)."
  );
  process.exit(1);
}

// Optional: local authorizer so claims/refunds work even if the facilitator
// does not advertise a receiverAuthorizer.
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

// Background claim / settle / refund loops
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
app.use(cors());

const maxPrice = "$0.01";

const httpServer = new x402HTTPResourceServer(resourceServer, {
  "GET /weather": {
    accepts: {
      scheme: "batch-settlement",
      price: maxPrice,
      network: NETWORK,
      payTo: evmAddress,
    },
    description: "Weather data (BatchRail demo)",
    mimeType: "application/json",
  },
});

async function main() {
  await httpServer.initialize();

  app.use(paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false));

  app.get("/weather", (_req, res) => {
    // Dynamic pricing demo: charge a random fraction of the max
    const chargedPercent = 1 + Math.floor(Math.random() * 100);
    setSettlementOverrides(res, { amount: `${chargedPercent}%` });

    res.json({
      report: {
        weather: "sunny",
        temperature: 70 + Math.floor(Math.random() * 10),
      },
      charged: `${chargedPercent}% of ${maxPrice}`,
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "batchrail-example-server", payTo: evmAddress });
  });

  app.listen(PORT, () => {
    console.log("");
    console.log("  BatchRail example resource server");
    console.log("  ─────────────────────────────────────");
    console.log(`  URL          http://localhost:${PORT}`);
    console.log(`  Resource     GET /weather  (batch-settlement, max ${maxPrice})`);
    console.log(`  payTo        ${evmAddress}`);
    console.log(`  Facilitator  ${facilitatorUrl}`);
    console.log(
      `  Authorizer   ${receiverAuthorizerSigner ? receiverAuthorizerSigner.address + " (local)" : "facilitator-delegated"}`
    );
    console.log("");
  });
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
