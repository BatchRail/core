# BatchRail Core Architecture

## Components

1. **Facilitator** (`packages/facilitator`)
   - Implements x402 v2 `/supported`, `/verify`, `/settle`
   - Registers `batch-settlement` (and optionally `exact`) for Base Sepolia first
   - Relays claims / settles / refunds signed by the receiverAuthorizer

2. **Channel Manager** (`packages/channel-manager`)
   - Background worker
   - Claim cadence (default 60 s)
   - Settle cadence (default 120 s)
   - Refund idle channels after withdrawDelay

3. **SDK** (`packages/sdk`)
   - Heuristics for preferring batch vs exact
   - Shared types and network helpers

4. **Examples**
   - Facilitator entrypoint
   - Express resource server
   - Fetch client

## Data flow (batch-settlement)

```
Client                  Resource Server              Facilitator              Chain
  |                          |                           |                     |
  |-- open channel deposit --|-------------------------->|-- deposit tx ------>|
  |                          |                           |                     |
  |-- request + voucher ---->|-- verify voucher -------->|                     |
  |                          |<-- ok --------------------|                     |
  |                          |-- return resource --------|                     |
  |                          |                           |                     |
  |                          |  (ChannelManager)         |                     |
  |                          |-- claim batch ----------->|-- claim tx -------->|
  |                          |-- settle ---------------->|-- settle tx ------->|
```

## Next implementation steps

1. Install official `@x402/core` + `@x402/evm` packages (once version pins are stable)
2. Replace skeleton verify/settle with real `BatchSettlementEvmScheme` / facilitator scheme
3. Wire `FileChannelStorage` or Redis storage
4. Start `ChannelManager` alongside the resource server
5. Add basic risk scoring hooks (wallet age, prior volume)
