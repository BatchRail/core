/**
 * BatchRail Facilitator
 * Compatible with x402 v2 + batch-settlement scheme on Base Sepolia.
 *
 * Endpoints:
 *   GET  /supported
 *   POST /verify
 *   POST /settle
 *
 * This is a minimal skeleton that mirrors the official x402 facilitator patterns.
 * Replace the placeholder scheme registration with the real
 * @x402/evm batch-settlement facilitator scheme once packages are installed.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const PORT = Number(process.env.FACILITATOR_PORT ?? 4022);
const NETWORK = process.env.NETWORK ?? "eip155:84532";
const RPC_URL = process.env.RPC_URL ?? "https://sepolia.base.org";

if (!process.env.FACILITATOR_PRIVATE_KEY) {
  console.error("Missing FACILITATOR_PRIVATE_KEY in .env");
  process.exit(1);
}

const account = privateKeyToAccount(
  process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`
);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ── Health ──────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "batchrail-facilitator",
    network: NETWORK,
    address: account.address,
  });
});

// ── /supported ──────────────────────────────────────────────
app.get("/supported", (_req, res) => {
  res.json({
    kinds: [
      {
        scheme: "batch-settlement",
        network: NETWORK,
        // Placeholder — real response comes from the registered scheme
        extra: {
          note: "BatchRail facilitator skeleton — wire @x402/evm batch-settlement scheme here",
        },
      },
      {
        scheme: "exact",
        network: NETWORK,
      },
    ],
  });
});

// ── /verify ─────────────────────────────────────────────────
app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body ?? {};

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        isValid: false,
        invalidReason: "missing_paymentPayload_or_paymentRequirements",
      });
    }

    // TODO: replace with real scheme.verify(...)
    // const result = await scheme.verify(paymentPayload, paymentRequirements);

    console.log("[verify] received", {
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
      amount: paymentRequirements.amount ?? paymentRequirements.maxAmountRequired,
    });

    // Skeleton always returns valid for local wiring tests
    res.json({
      isValid: true,
      payer: paymentPayload?.payload?.authorization?.from ?? null,
      note: "skeleton — replace with real BatchSettlementEvmFacilitator verify",
    });
  } catch (err: any) {
    console.error("[verify] error", err);
    res.status(500).json({
      isValid: false,
      invalidReason: err?.message ?? "internal_error",
    });
  }
});

// ── /settle ─────────────────────────────────────────────────
app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body ?? {};

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        success: false,
        errorReason: "missing_paymentPayload_or_paymentRequirements",
      });
    }

    // TODO: replace with real scheme.settle(...)
    console.log("[settle] received", {
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
    });

    res.json({
      success: true,
      transaction: "0xSKELETON_PLACEHOLDER",
      network: NETWORK,
      payer: paymentPayload?.payload?.authorization?.from ?? null,
      note: "skeleton — replace with real on-chain settle / claim relay",
    });
  } catch (err: any) {
    console.error("[settle] error", err);
    res.status(500).json({
      success: false,
      errorReason: err?.message ?? "internal_error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`BatchRail facilitator listening on http://localhost:${PORT}`);
  console.log(`  address  : ${account.address}`);
  console.log(`  network  : ${NETWORK}`);
  console.log(`  endpoints: GET /supported  POST /verify  POST /settle`);
});
