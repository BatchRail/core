/**
 * BatchRail example client — official batch-settlement scheme
 *
 * End-to-end loop on Base Sepolia:
 * 1. Hit the protected resource (GET /weather by default)
 * 2. On first request: open a payment channel (deposit USDC once)
 * 3. Subsequent requests: sign cheap off-chain cumulative vouchers
 * 4. Server verifies via facilitator and returns the resource
 * 5. ChannelManager (on the server) later claims + settles on-chain
 *
 * Channel state is written to disk. Restarting this process reuses the
 * same channel instead of sending a fresh-deposit voucher at cumulative 0
 * (that path returns 402 payment_invalid).
 *
 * Requires:
 *   - Facilitator on FACILITATOR_URL (local or https://facilitator.batchrail.io)
 *   - Resource server on RESOURCE_SERVER_URL
 *   - EVM_PRIVATE_KEY funded with Base Sepolia USDC
 */

import crypto from "node:crypto";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "examples/client/.env"),
  path.resolve(packageRoot, ".env"),
  path.resolve(__dirname, "../../../.env"),
];

const loadedEnvPaths: string[] = [];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath, override: false });
    if (!result.error) loadedEnvPaths.push(envPath);
  }
}

function readPrivateKey(): string | undefined {
  const raw =
    process.env.EVM_PRIVATE_KEY?.trim() ||
    process.env.CLIENT_PRIVATE_KEY?.trim() ||
    process.env.PRIVATE_KEY?.trim();
  if (!raw) return undefined;
  return raw.replace(/^[\'"]|[\'"]$/g, "") || undefined;
}

const ZERO_SALT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const SALT_RE = /^0x[0-9a-fA-F]{64}$/;

function resolveStorageDir(): string {
  const raw = process.env.CLIENT_CHANNEL_STORAGE_DIR?.trim();
  if (raw) return path.resolve(process.cwd(), raw);
  return path.join(packageRoot, ".client-channels");
}

function resolveSalt(storageDir: string): { salt: `0x${string}`; source: string } {
  const envSalt = process.env.CHANNEL_SALT?.trim();
  if (envSalt) {
    if (!SALT_RE.test(envSalt)) {
      throw new Error(
        "CHANNEL_SALT must be 0x + 64 hex chars (bytes32). Omit it to reuse the salt file."
      );
    }
    return { salt: envSalt as `0x${string}`, source: "CHANNEL_SALT env" };
  }

  const saltFile = path.join(storageDir, "channel-salt.txt");
  if (fs.existsSync(saltFile)) {
    const saved = fs.readFileSync(saltFile, "utf8").trim();
    if (!SALT_RE.test(saved)) {
      throw new Error(`Invalid salt in ${saltFile}`);
    }
    return { salt: saved as `0x${string}`, source: saltFile };
  }

  const generated = (`0x${crypto.randomBytes(32).toString("hex")}`) as `0x${string}`;
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(saltFile, `${generated}\n`, "utf8");
  return { salt: generated, source: `generated → ${saltFile}` };
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
    console.error("A .env was loaded but EVM_PRIVATE_KEY was empty or missing inside it.");
  } else {
    console.error("No .env file was found in any of the paths above.");
  }
  process.exit(1);
}

if (!/^0x[0-9a-fA-F]{64}$/.test(evmPrivateKeyRaw)) {
  console.error("EVM_PRIVATE_KEY looks invalid. Expected 0x + 64 hex characters.");
  process.exit(1);
}

const evmPrivateKey = evmPrivateKeyRaw as `0x${string}`;
const voucherKeyRaw =
  process.env.EVM_VOUCHER_SIGNER_PRIVATE_KEY?.trim()?.replace(/^[\'"]|[\'"]$/g, "") ||
  undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const url = `${baseURL}${endpointPath}`;
const numberOfRequests = Number(process.env.NUMBER_OF_REQUESTS ?? "3");
const depositMultiplier = Number(process.env.DEPOSIT_MULTIPLIER ?? "5");
const refundAfterRequests = process.env.REFUND_AFTER_REQUESTS === "true";
const refundAmount = process.env.REFUND_AMOUNT;
const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";

async function main(): Promise<void> {
  const storageDir = resolveStorageDir();
  fs.mkdirSync(storageDir, { recursive: true });
  const { salt: channelSalt, source: saltSource } = resolveSalt(storageDir);

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
  console.log(`  Storage         ${storageDir}`);
  console.log(`  Channel salt    ${channelSalt}`);
  console.log(`  Salt source     ${saltSource}`);
  if (channelSalt.toLowerCase() === ZERO_SALT) {
    console.log(
      "  Note            zero salt = one channel per payer+payTo+token+authorizer+delay"
    );
  }
  console.log(`  Requests        ${numberOfRequests}`);
  console.log(`  Deposit mult.   ${depositMultiplier}x`);
  console.log("  Network         eip155:84532 (Base Sepolia — testnet only)");
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

  console.log("Done. Channel files are in the storage dir — keep them to reuse this channel.");
}

main().catch((error) => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
