/**
 * BatchRail example client — official batch-settlement scheme
 *
 * End-to-end local loop on Base Sepolia:
 * 1. Hit the protected resource (GET /weather)
 * 2. On first request: open a payment channel (deposit USDC once)
 * 3. Subsequent requests: sign cheap off-chain cumulative vouchers
 * 4. Server verifies via facilitator and returns the resource
 * 5. ChannelManager (on the server) later claims + settles on-chain
 *
 * Requires:
 *   - Facilitator running on FACILITATOR_URL (default http://localhost:4022)
 *   - Example server running on RESOURCE_SERVER_URL (default http://localhost:4021)
 *   - EVM_PRIVATE_KEY funded with Base Sepolia USDC
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { toClientEvmSigner } from "@x402/evm";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/client";
import { FileClientChannelStorage } from "@x402/evm/batch-settlement/client/file-storage";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";

// ── Load .env from several likely locations ─────────────────
// `import "dotenv/config"` only reads process.cwd()/.env, which breaks
// when pnpm runs the package from a different working directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "examples/client/.env"),
  path.resolve(__dirname, "../.env"), // examples/client/.env
  path.resolve(__dirname, "../../../.env"), // monorepo root from src/
];

const loadedEnvPaths: string[] = [];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath, override: false });
    if (!result.error) {
      loadedEnvPaths.push(envPath);
    }
  }
}

function readPrivateKey(): string | undefined {
  // Accept common variants people accidentally use
  const raw =
    process.env.EVM_PRIVATE_KEY?.trim() ||
    process.env.CLIENT_PRIVATE_KEY?.trim() ||
    process.env.PRIVATE_KEY?.trim();
  if (!raw) return undefined;
  // Strip surrounding quotes if present
  const unquoted = raw.replace(/^['"]|['"]$/g, "");
  return unquoted || undefined;
}

const evmPrivateKeyRaw = readPrivateKey();
if (!evmPrivateKeyRaw) {
  console.error("Missing EVM_PRIVATE_KEY in .env");
  console.error("This wallet must hold Base Sepolia USDC to open a payment channel.");
  console.error("USDC address: 0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  console.error("");
  console.error("cwd:", process.cwd());
  console.error("Checked .env paths:");
  for (const p of envCandidates) {
    console.error(`  ${fs.existsSync(p) ? "found" : "miss "}  ${p}`);
  }
  if (loadedEnvPaths.length) {
    console.error("Loaded from:", loadedEnvPaths.join(", "));
    console.error(
      "A .env was loaded but EVM_PRIVATE_KEY was empty or missing inside it."
    );
    console.error('Expected line:  EVM_PRIVATE_KEY=0xabc123...  (no spaces around =)');
  } else {
    console.error("No .env file was found in any of the paths above.");
  }
  process.exit(1);
}

if (!/^0x[0-9a-fA-F]{64}$/.test(evmPrivateKeyRaw)) {
  console.error(
    "EVM_PRIVATE_KEY looks invalid. Expected 0x + 64 hex characters (32-byte key)."
  );
  console.error(`Got length=${evmPrivateKeyRaw.length} prefix=${evmPrivateKeyRaw.slice(0, 4)}…`);
  process.exit(1);
}

const evmPrivateKey = evmPrivateKeyRaw as `0x${string}`;
const voucherKeyRaw =
  process.env.EVM_VOUCHER_SIGNER_PRIVATE_KEY?.trim()?.replace(/^['"]|['"]$/g, "") ||
  undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const url = `${baseURL}${endpointPath}`;
const storageDir = process.env.CLIENT_CHANNEL_STORAGE_DIR || "./client-channels";
const channelSalt = (process.env.CHANNEL_SALT ??
  "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`;
const numberOfRequests = Number(process.env.NUMBER_OF_REQUESTS ?? "3");
const depositMultiplier = Number(process.env.DEPOSIT_MULTIPLIER ?? "5");
const refundAfterRequests = process.env.REFUND_AFTER_REQUESTS === "true";
const refundAmount = process.env.REFUND_AMOUNT;
const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";

async function main(): Promise<void> {
  const account = privateKeyToAccount(evmPrivateKey);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const signer = toClientEvmSigner(account, publicClient);

  const voucherSigner = voucherKeyRaw
    ? toClientEvmSigner(privateKeyToAccount(voucherKeyRaw as `0x${string}`))
    : undefined;

  const batchedScheme = new BatchSettlementEvmScheme(signer, {
    depositPolicy: { depositMultiplier },
    salt: channelSalt,
    storage: new FileClientChannelStorage({ directory: storageDir }),
    ...(voucherSigner ? { voucherSigner } : {}),
  });

  const client = new x402Client();
  client.register("eip155:*", batchedScheme);

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  console.log("");
  console.log("  BatchRail example client");
  console.log("  ─────────────────────────────────────");
  if (loadedEnvPaths.length) {
    console.log(`  .env            ${loadedEnvPaths[0]}`);
  }
  console.log(`  Target          ${url}`);
  console.log(`  Payer           ${signer.address}`);
  console.log(`  Voucher signer  ${voucherSigner?.address ?? signer.address}`);
  console.log(`  Requests        ${numberOfRequests}`);
  console.log(`  Deposit mult.   ${depositMultiplier}x`);
  console.log("");

  for (let i = 0; i < numberOfRequests; i++) {
    const t0 = performance.now();
    console.log(`→ Request ${i + 1}/${numberOfRequests}…`);

    const response = await fetchWithPayment(url, { method: "GET" });
    const result = await httpClient.processResponse(response);

    if (result.paymentStatus === "settled") {
      console.log(`  ✓ settled — ${((performance.now() - t0) / 1000).toFixed(3)}s`);
      console.log("  body:", result.body);
      if (result.header) {
        console.log("  payment-response:", JSON.stringify(result.header, null, 2));
      }
    } else {
      console.log(`  ✗ no settlement — ${((performance.now() - t0) / 1000).toFixed(3)}s`);
      console.log("  result:", JSON.stringify(result, null, 2));
    }
    console.log("");
  }

  if (refundAfterRequests) {
    console.log(
      refundAmount
        ? `Requesting partial refund of ${refundAmount} base units…`
        : "Requesting full refund of remaining channel balance…"
    );
    const refundT0 = performance.now();
    const settle = await batchedScheme.refund(url, {
      ...(refundAmount ? { amount: refundAmount } : {}),
    });
    console.log(JSON.stringify(settle, null, 2));
    console.log(`Refund completed in ${((performance.now() - refundT0) / 1000).toFixed(3)}s`);
  }

  console.log("Done. Check the example-server logs for claim/settle activity.");
}

main().catch((error) => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
