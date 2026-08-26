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
 * Optional protection (env):
 *   API_KEY — if set, require X-API-Key or Authorization: Bearer on all routes except /health
 *   RATE_LIMIT_PER_MIN — max requests per IP per minute (default 120)
 */

import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { x402Facilitator } from "@x402/core/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/facilitator";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";

const PORT = Number(process.env.PORT ?? process.env.FACILITATOR_PORT ?? 4022);
const NETWORK = (process.env.NETWORK ?? "eip155:84532") as "eip155:84532";
const RPC_URL = process.env.RPC_URL ?? "https://sepolia.base.org";
const API_KEY = process.env.API_KEY?.trim() || "";
const RATE_LIMIT_PER_MIN = Math.max(
  1,
  Number(process.env.RATE_LIMIT_PER_MIN ?? 120)
);

if (!process.env.FACILITATOR_PRIVATE_KEY) {
  console.error(
    "Missing FACILITATOR_PRIVATE_KEY\n" +
      "This key pays gas and relays claim/settle/refund transactions on Base Sepolia."
  );
  process.exit(1);
}

const account = privateKeyToAccount(
  process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`
);

const authorizerKey = process.env.RECEIVER_AUTHORIZER_PRIVATE_KEY as
  | `0x${string}`
  | undefined;
const authorizerAccount = authorizerKey
  ? privateKeyToAccount(authorizerKey)
  : undefined;

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC_URL),
}).extend(publicActions);

const facilitatorSigner = toFacilitatorEvmSigner(walletClient);
const facilitator = new x402Facilitator();

facilitator.register(
  NETWORK,
  new BatchSettlementEvmScheme(facilitatorSigner, authorizerAccount)
);

registerExactEvmScheme(facilitator, {
  signer: facilitatorSigner,
  networks: NETWORK,
});

facilitator
  .onBeforeVerify(async ({ requirements }) => {
    console.log("[verify] scheme=%s network=%s", requirements.scheme, requirements.network);
  })
  .onAfterSettle(async ({ result }) => {
    console.log("[settle] success tx=%s", result.transaction ?? "(none)");
  })
  .onSettleFailure(async ({ error }) => {
    console.error("[settle] failure:", error?.message ?? error);
  });

function normalizeSupported(raw: unknown) {
  const data = (raw ?? {}) as {
    kinds?: Array<Record<string, unknown>>;
    extensions?: unknown;
    signers?: unknown;
  };

  const kinds = Array.isArray(data.kinds)
    ? data.kinds
        .filter((k) => k && typeof k === "object")
        .map((k) => {
          const kind: {
            x402Version: number;
            scheme: string;
            network: string;
            extra?: Record<string, unknown>;
          } = {
            x402Version: Number(k.x402Version ?? 2),
            scheme: String(k.scheme ?? ""),
            network: String(k.network ?? ""),
          };

          if (k.extra && typeof k.extra === "object" && !Array.isArray(k.extra)) {
            const extra: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(k.extra as Record<string, unknown>)) {
              if (value === undefined) continue;
              if (typeof value === "bigint") {
                extra[key] = value.toString();
              } else if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean" ||
                value === null ||
                (typeof value === "object" && value !== null)
              ) {
                extra[key] = value;
              }
            }
            if (Object.keys(extra).length > 0) kind.extra = extra;
          }

          return kind;
        })
        .filter((k) => k.scheme && k.network)
    : [];

  const extensions = Array.isArray(data.extensions)
    ? data.extensions.map((e) => String(e))
    : [];

  const signers: Record<string, string[]> = {};
  if (data.signers && typeof data.signers === "object" && !Array.isArray(data.signers)) {
    for (const [family, addrs] of Object.entries(data.signers as Record<string, unknown>)) {
      if (Array.isArray(addrs)) {
        signers[family] = addrs.map((a) => String(a));
      }
    }
  }

  if (!signers["eip155:*"] && !signers["eip155"]) {
    signers["eip155:*"] = [account.address];
  }

  return { kinds, extensions, signers };
}

// ── Optional rate limit (in-memory, per IP) ──────────────────
type Bucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && xf[0]) return xf[0].split(",")[0]!.trim();
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/health") return next();

  const ip = clientIp(req);
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_PER_MIN) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "rate_limit_exceeded" });
  }
  next();
}

// ── Optional API key (only when API_KEY env is set) ──────────
function optionalApiKey(req: Request, res: Response, next: NextFunction) {
  if (!API_KEY) return next(); // open demo mode
  if (req.path === "/health") return next(); // always open for probes

  const headerKey = req.header("x-api-key")?.trim();
  const auth = req.header("authorization")?.trim();
  const bearer =
    auth && auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : undefined;
  const provided = headerKey || bearer;

  if (provided !== API_KEY) {
    return res.status(401).json({ error: "unauthorized", message: "Valid API key required" });
  }
  next();
}

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit);
app.use(optionalApiKey);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "batchrail-facilitator",
    network: NETWORK,
    address: account.address,
    receiverAuthorizer: authorizerAccount?.address ?? null,
    apiKeyRequired: Boolean(API_KEY),
  });
});

app.get("/supported", async (_req, res) => {
  try {
    const raw = await Promise.resolve(facilitator.getSupported());
    res.json(normalizeSupported(raw));
  } catch (err: any) {
    console.error("[supported] error", err);
    res.status(500).json({ error: err?.message ?? "internal_error" });
  }
});

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

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  BatchRail facilitator ready");
  console.log("  ─────────────────────────────────────");
  console.log(`  Port                ${PORT}`);
  console.log(`  Network             ${NETWORK}`);
  console.log(`  Facilitator address ${account.address}`);
  if (authorizerAccount) {
    console.log(`  Receiver authorizer ${authorizerAccount.address} (facilitator-delegated)`);
  } else {
    console.log("  Receiver authorizer (none — servers must supply their own)");
  }
  console.log(`  API key             ${API_KEY ? "required (except /health)" : "open demo (API_KEY unset)"}`);
  console.log(`  Rate limit          ${RATE_LIMIT_PER_MIN}/min per IP`);
  console.log("  Schemes             batch-settlement, exact");
  console.log("  Endpoints           GET /supported  POST /verify  POST /settle");
  console.log("");
});
