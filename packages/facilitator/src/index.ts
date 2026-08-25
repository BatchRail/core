/**
 * BatchRail Facilitator
 *
 * Real x402 v2 facilitator with the official batch-settlement scheme
 * wired in for Base Sepolia (eip155:84532).
 *
 * Endpoints:
 *   GET  /health
 *   GET  /supported
 *   POST /verify
 *   POST /settle
 *
 * What this does (in plain English):
 * - Clients (buyers) open a payment channel by depositing USDC once.
 * - Each API call is paid with a cheap off-chain "voucher" signature.
 * - This facilitator checks those vouchers (/verify) and later pushes
 *   the real on-chain claim / settle / refund transactions (/settle).
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { x402Facilitator } from "@x402/core/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/facilitator";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";

const PORT = Number(process.env.FACILITATOR_PORT ?? 4022);
const NETWORK = (process.env.NETWORK ?? "eip155:84532") as "eip155:84532";
const RPC_URL = process.env.RPC_URL ?? "https://sepolia.base.org";

// ── Keys ────────────────────────────────────────────────────
if (!process.env.FACILITATOR_PRIVATE_KEY) {
  console.error(
    "Missing FACILITATOR_PRIVATE_KEY in .env\n" +
      "This key pays gas and relays claim/settle/refund transactions on Base Sepolia."
  );
  process.exit(1);
}

const account = privateKeyToAccount(
  process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`
);

// Optional dedicated authorizer — if set, the facilitator advertises this
// address as receiverAuthorizer so resource servers can delegate claim/refund
// signatures to us. If unset, servers must supply their own authorizer key.
const authorizerKey = process.env.RECEIVER_AUTHORIZER_PRIVATE_KEY as
  | `0x${string}`
  | undefined;
const authorizerAccount = authorizerKey
  ? privateKeyToAccount(authorizerKey)
  : undefined;

// ── Viem wallet + public client ─────────────────────────────
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC_URL),
}).extend(publicActions);

const facilitatorSigner = toFacilitatorEvmSigner(walletClient);

// ── Register schemes with the official x402Facilitator ──────
const facilitator = new x402Facilitator();

// Primary: batch-settlement (the whole point of BatchRail)
facilitator.register(
  NETWORK,
  new BatchSettlementEvmScheme(
    facilitatorSigner,
    authorizerAccount // optional — omit to force servers to bring their own authorizer
  )
);

// Also support exact (fallback for low-volume / one-off payments)
registerExactEvmScheme(facilitator, {
  signer: facilitatorSigner,
  networks: NETWORK,
});

// Optional logging hooks
facilitator
  .onBeforeVerify(async ({ paymentPayload, requirements }) => {
    console.log("[verify] scheme=%s network=%s", requirements.scheme, requirements.network);
  })
  .onAfterSettle(async ({ result }) => {
    console.log("[settle] success tx=%s", result.transaction ?? "(none)");
  })
  .onSettleFailure(async ({ error }) => {
    console.error("[settle] failure:", error?.message ?? error);
  });

// ── HTTP server ─────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "batchrail-facilitator",
    network: NETWORK,
    address: account.address,
    receiverAuthorizer: authorizerAccount?.address ?? null,
  });
});

/**
 * GET /supported
 * Lists the schemes + networks this facilitator can handle.
 * Resource servers and clients call this first.
 */
app.get("/supported", async (_req, res) => {
  try {
    const supported = await facilitator.getSupported();
    res.json(supported);
  } catch (err: any) {
    console.error("[supported] error", err);
    res.status(500).json({ error: err?.message ?? "internal_error" });
  }
});

/**
 * POST /verify
 * Body: { paymentPayload, paymentRequirements }
 * Checks a deposit or voucher without spending gas.
 */
app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body ?? {};
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        isValid: false,
        invalidReason: "missing_paymentPayload_or_paymentRequirements",
      });
    }

    const result = await facilitator.verify(paymentPayload, paymentRequirements);
    res.json(result);
  } catch (err: any) {
    console.error("[verify] error", err);
    res.status(500).json({
      isValid: false,
      invalidReason: err?.message ?? "internal_error",
    });
  }
});

/**
 * POST /settle
 * Body: { paymentPayload, paymentRequirements }
 * Executes the on-chain action (deposit / claim / settle / refund).
 */
app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body ?? {};
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        success: false,
        errorReason: "missing_paymentPayload_or_paymentRequirements",
      });
    }

    const result = await facilitator.settle(paymentPayload, paymentRequirements);
    res.json(result);
  } catch (err: any) {
    console.error("[settle] error", err);
    res.status(500).json({
      success: false,
      errorReason: err?.message ?? "internal_error",
    });
  }
});

app.listen(PORT, () => {
  console.log("");
  console.log("  BatchRail facilitator ready");
  console.log("  ─────────────────────────────────────");
  console.log(`  URL                 http://localhost:${PORT}`);
  console.log(`  Network             ${NETWORK}`);
  console.log(`  Facilitator address ${account.address}`);
  if (authorizerAccount) {
    console.log(`  Receiver authorizer ${authorizerAccount.address} (facilitator-delegated)`);
  } else {
    console.log("  Receiver authorizer (none — servers must supply their own)");
  }
  console.log("  Schemes             batch-settlement, exact");
  console.log("  Endpoints           GET /supported  POST /verify  POST /settle");
  console.log("");
});
