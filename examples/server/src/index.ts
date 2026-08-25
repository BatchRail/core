/**
 * Example resource server protected by batch-settlement.
 * In production this will use @x402/express + BatchSettlementEvmScheme
 * + FileChannelStorage / RedisChannelStorage + ChannelManager.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";

const PORT = 4021;
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "http://localhost:4022";
const PAY_TO = process.env.EVM_ADDRESS ?? "0x0000000000000000000000000000000000000000";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "batchrail-example-server" });
});

/**
 * Protected resource. Real implementation returns 402 with
 * PaymentRequirements for scheme=batch-settlement, then verifies
 * the voucher via the facilitator and runs the ChannelManager.
 */
app.get("/weather", async (req, res) => {
  // Skeleton: just return data. Wire paymentMiddleware next.
  res.json({
    temperature: 21 + Math.floor(Math.random() * 10),
    unit: "C",
    note: "skeleton — protect with batch-settlement middleware",
    payTo: PAY_TO,
    facilitator: FACILITATOR_URL,
  });
});

app.listen(PORT, () => {
  console.log(`Example resource server on http://localhost:${PORT}`);
  console.log(`  GET /weather  (will be batch-settlement protected)`);
  console.log(`  facilitator → ${FACILITATOR_URL}`);
});
