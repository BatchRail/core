/**
 * @batchrail/sdk
 *
 * Thin helpers that prefer batch-settlement when volume justifies it
 * and fall back to exact. Real implementation will wrap
 * @x402/evm BatchSettlementEvmScheme + ExactEvmScheme.
 */

export const BATCHRAIL_VERSION = "0.1.0";

export type PreferBatchOptions = {
  /** Estimated requests in the session */
  expectedRequests?: number;
  /** Force exact even if volume is high */
  forceExact?: boolean;
};

/**
 * Heuristic: prefer batch when we expect more than ~20 requests
 * (exact $0.001 fee becomes expensive relative to GMV).
 */
export function shouldPreferBatch(opts: PreferBatchOptions = {}): boolean {
  if (opts.forceExact) return false;
  const n = opts.expectedRequests ?? 1;
  return n >= 20;
}

export function getDefaultNetwork(): string {
  return process.env.NETWORK ?? "eip155:84532";
}
