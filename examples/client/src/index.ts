/**
 * Example client that will use BatchSettlementEvmScheme.
 * First request opens a channel (deposit); subsequent requests
 * send cumulative vouchers.
 */

import "dotenv/config";

const SERVER = process.env.RESOURCE_URL ?? "http://localhost:4021";

async function main() {
  console.log("BatchRail example client");
  console.log(`  target: ${SERVER}/weather`);
  console.log("  (skeleton — wire @x402/fetch + BatchSettlementEvmScheme next)");

  const res = await fetch(`${SERVER}/weather`);
  const data = await res.json();
  console.log("Response:", data);
}

main().catch(console.error);
