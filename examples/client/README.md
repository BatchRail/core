# Example client (Base Sepolia)

Independent x402 **buyer** for BatchRail’s batch-settlement rail.

Public builder: Capt. Riker (· [@BatchRail](https://x.com/BatchRail)). Testnet only.

## Why this exists

The official SDK defaults to **in-memory** channel state and a **zero salt**.
A process restart then signs a fresh-deposit voucher at cumulative 0 and the
seller returns `402 payment_invalid`. This example:

1. Persists channel state to disk (`FileClientChannelStorage`)
2. Persists a 32-byte salt so the next run reuses the same channel
3. Logs both so you can see what you are about to sign

It does **not** recover a forgotten channel from chain. Keep the storage directory.

## Seller payment-response (second-buy checklist)

A seller that omits the charged cumulative looks fine on the **first** purchase
(channel open) and only fails on the **second** (`402 payment_invalid`).

Every successful paid batch response must include, in official field names:

- `extra.chargedAmount` — this request’s **price**, not the deposit
- `extra.channelState.chargedCumulativeAmount` — running **price** total

On a channel-opening sale the top-level `amount` may be the deposit. The client
builds the next voucher from `chargedCumulativeAmount`, not from that deposit.
Two sequential purchases on one channel is the pin test.

## Env

Copy `.env.example` to `.env` in this folder (or the repo root).

| Variable | Purpose |
|----------|--------|
| `EVM_PRIVATE_KEY` | Buyer key with Base Sepolia USDC |
| `RESOURCE_SERVER_URL` | Seller origin (no path) |
| `ENDPOINT_PATH` | Paid route, default `/weather` |
| `CLIENT_CHANNEL_STORAGE_DIR` | Disk dir for channel files. Default `examples/client/.client-channels` |
| `CHANNEL_SALT` | Optional `0x` + 64 hex chars. If omitted, a random salt is written to `$CLIENT_CHANNEL_STORAGE_DIR/channel-salt.txt` and reused |
| `NUMBER_OF_REQUESTS` | How many paid GETs |
| `DEPOSIT_MULTIPLIER` | First-open deposit vs advertised `amount` (SDK default 5) |

USDC (Base Sepolia): `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

## Run against the hosted demo seller

```bash
cd examples/client
cp .env.example .env
# set EVM_PRIVATE_KEY
pnpm install
pnpm --filter @batchrail/example-client start
```

First process: opens a channel (on-chain deposit) then signs vouchers.
Second process, same `.env` and same storage dir: reuses the channel.

Point `RESOURCE_SERVER_URL` at another Sepolia seller to act as a second
independent buyer on the same rail. The facilitator URL is the **seller’s**
problem — the buyer only hits the paid route.

## Salt

Channel id includes the salt. Zero salt ⇒ one channel per payer + seller + token + authorizer + delay. A new random salt ⇒ a new channel (new deposit) even for the same pair. Do not rotate salt unless you mean to open another channel.

## Testnet warning

Network `eip155:84532` only. No mainnet keys in this example.
