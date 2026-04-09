# HDSWEEPER — HD Wallet Sweep Tool

## Overview

Standalone Node.js application for sweeping funds from HD-derived EVM wallets to a custodial destination. Features a dark-themed web UI, MongoDB persistence, pausable/resumable jobs, gas monitoring, and multi-chain support.

---

## Technical Stack

| Layer        | Technology                                           |
| ------------ | ---------------------------------------------------- |
| Runtime      | Node.js 18+                                          |
| Language     | TypeScript                                           |
| Server       | @hapi/hapi + @hapi/inert (static) + @hapi/vision     |
| Database     | MongoDB 6+ via Mongoose                              |
| Blockchain   | ethers.js v5 (HD derivation, RPC, signing, contracts) |
| UI           | Vanilla HTML/CSS/JS SPA (dark theme, no framework)   |
| Process      | Single process, in-memory job state + DB persistence  |

## Database

```
mongodb://127.0.0.1:27017/HDSweeper
```

Configurable via `MONGODB_URI` in `.env`.

---

## Data Models

| Model             | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `AppConfig`       | Singleton: encrypted mnemonic, custodial wallet address       |
| `RpcEndpoint`     | Chain RPCs (chainId, name, url, isActive)                     |
| `TokenContract`   | ERC20 contracts (chainId, address, symbol, name, decimals)    |
| `WalletList`      | Named import batches of wallet addresses                      |
| `WalletAddress`   | Individual wallet addresses within a list                     |
| `DerivedKey`      | Derived address→index mapping (no private keys stored on disk)|
| `SweepJob`        | Sweep job state (status, chain, progress, errors)             |
| `SweepLog`        | Per-transaction log entries (tx hash, amount, status)         |
| `GasWallet`       | Gas funder config (derivation index, per-chain balances)      |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Dark Theme UI                     │
│  ┌────────┬──────────┬───────────┬────────┬───────┐ │
│  │ Setup  │ Gas Mgmt │ Contracts │ RPCs   │ Sweep │ │
│  └────────┴──────────┴───────────┴────────┴───────┘ │
│          ↕ REST API (fetch)                          │
├─────────────────────────────────────────────────────┤
│              @hapi/hapi Server                       │
│  ┌──────────────────────────────────────────────┐   │
│  │ Routes: /api/config, /api/gas, /api/contracts│   │
│  │         /api/rpcs, /api/wallets, /api/sweep  │   │
│  │         /api/keys, /api/logs                 │   │
│  └──────────────────────────────────────────────┘   │
│          ↕                          ↕                │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │   MongoDB    │    │   Blockchain Services     │   │
│  │  (Mongoose)  │    │  - Key Derivation (pause) │   │
│  │              │    │  - Sweeper (per-chain)     │   │
│  │              │    │  - Gas Monitor             │   │
│  └──────────────┘    └──────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## UI Pages (Tabs)

### 1. Setup
- Enter 12-word mnemonic → saved to DB (encrypted at rest)
- Enter custodial wallet address → saved to DB
- Visual confirmation that both are stored
- Edit/clear functionality

### 2. Gas Management
- Select or enter gas wallet derivation index
- Show derived address
- Check native token balance on every configured chain
- Visual indicator: funded / low / empty per chain
- "Refresh balances" button

### 3. Token Contracts
- Table of all contracts grouped by chain
- Seeded with popular tokens (USDT, USDC, WETH, WBTC, DAI, etc.)
- Add new: enter contract address + chain → auto-fetch name, symbol, decimals from chain
- Edit / Delete / Toggle active
- Import contracts from JSON
- Validate contract on-chain before saving

### 4. RPC Management
- Table of RPCs per chain
- Seeded with default RPCs (same as existing balance job)
- Add / Edit / Delete / Test connectivity
- Toggle active/inactive
- Latency check

### 5. Key Derivation
- Configure max derivation index (default 200,000)
- Start / Pause / Resume derivation job
- Progress bar: derived X / 200,000
- Shows matched wallet count in real-time
- Stores address→index mapping in DB (private keys derived on-the-fly during sweep)

### 6. Wallet Lists
- Import wallet addresses (paste, CSV, or JSON)
- Give each import a name (e.g. "BSC Hot Wallets Q1")
- View list with status per wallet
- Shows which wallets have been matched to derived keys
- Filter by chain, sweep status

### 7. Sweep Dashboard
- Select wallet list to sweep
- Select chains to include
- Start / Pause / Resume sweep
- Real-time progress per chain:
  - Wallets processed / total
  - Tokens swept / total
  - USD value swept
  - Current wallet being processed
- Gas monitor panel:
  - Per-chain gas funder balance
  - **Auto-pause** when gas runs out → UI shows "Gas depleted on Chain X, stopped at Wallet Y"
  - Fund gas → click Resume
- Failed transactions list with retry option

### 8. Logs
- Searchable, filterable transaction log
- Filter by chain, wallet, token, status (success/failed)
- Export to CSV
- Real-time streaming (polling)

---

## Sweep Execution Flow

```
1. User clicks "Start Sweep" on a wallet list
2. System groups wallets by chain
3. Per chain (sequential):
   a. Check gas funder balance → if insufficient, pause + notify
   b. Calculate gas needed for all wallets with ERC20s
   c. Distribute gas to wallets (sequential from funder)
   d. Sweep ERC20 tokens per wallet (sequential within wallet, parallel across wallets)
   e. Sweep native tokens last (balance - gas cost)
   f. Sweep gas funder remainder
4. After each tx: log to DB, update progress, check gas
5. If gas depleted mid-sweep: pause job, log position, notify UI
6. User funds gas → clicks Resume → picks up from checkpoint
```

---

## Seeded Data

### RPCs (from existing system)
- Asset Chain (42420), Ethereum (1), BSC (56), Arbitrum (42161), Base (8453), Polygon (137)

### Token Contracts (popular per chain)
- **Ethereum**: USDT, USDC, WETH, WBTC, DAI, LINK, UNI
- **BSC**: USDT, USDC, BUSD, WBNB, BTCB, ETH, CAKE
- **Polygon**: USDT, USDC, WMATIC, WETH, WBTC, DAI, AAVE
- **Arbitrum**: USDT, USDC, WETH, WBTC, DAI, ARB, GMX
- **Base**: USDC, WETH, DAI, cbETH
- **Asset Chain**: (project-specific tokens as needed)

---

## Security Considerations

- Mnemonic stored AES-256 encrypted in DB (encryption key from env var)
- Private keys NEVER stored on disk — derived on-the-fly from mnemonic + index
- UI accessible only on localhost by default
- No external API exposure
- Gas funder nonce managed sequentially to prevent collisions
- All RPC calls wrapped in retry + timeout

---

## Project Structure

```
HDSWEEPER/
├── ROADMAP.md
├── package.json
├── tsconfig.json
├── .env
├── .gitignore
└── src/
    ├── server.ts                 # Hapi server entry point
    ├── config/
    │   ├── database.ts           # Mongoose connection
    │   └── seed.ts               # Seed RPCs + contracts
    ├── models/
    │   ├── AppConfig.ts
    │   ├── RpcEndpoint.ts
    │   ├── TokenContract.ts
    │   ├── WalletList.ts
    │   ├── WalletAddress.ts
    │   ├── DerivedKey.ts
    │   ├── SweepJob.ts
    │   ├── SweepLog.ts
    │   └── GasWallet.ts
    ├── routes/
    │   ├── index.ts              # Route registration
    │   ├── config.ts
    │   ├── gas.ts
    │   ├── contracts.ts
    │   ├── rpcs.ts
    │   ├── keys.ts
    │   ├── wallets.ts
    │   ├── sweep.ts
    │   └── logs.ts
    ├── services/
    │   ├── keyDerivation.ts      # Pausable HD key generation
    │   ├── sweeper.ts            # Core sweep engine
    │   ├── blockchain.ts         # RPC helpers, balance checks
    │   └── gasMonitor.ts         # Gas balance tracking
    └── public/
        ├── index.html
        ├── css/
        │   └── style.css         # Dark theme
        └── js/
            ├── app.js            # SPA router + state
            ├── api.js            # API client
            ├── pages/
            │   ├── setup.js
            │   ├── gas.js
            │   ├── contracts.js
            │   ├── rpcs.js
            │   ├── keys.js
            │   ├── wallets.js
            │   ├── sweep.js
            │   └── logs.js
            └── components/
                ├── toast.js
                ├── modal.js
                └── table.js
```

---

## Phase Plan

### Phase 1 — Foundation ✅
- [x] Project scaffolding
- [x] Hapi server + MongoDB connection
- [x] All data models
- [x] Seed data (RPCs + contracts)
- [x] Dark theme UI shell with tab navigation
- [x] Setup page (mnemonic + custodial wallet)
- [x] RPC management page
- [x] Token contracts page

### Phase 2 — Key Derivation & Wallets ✅
- [x] Gas wallet management page
- [x] Pausable key derivation service + UI
- [x] Wallet list import + management page

### Phase 3 — Sweep Engine ✅
- [x] Core sweep service (per-chain, per-wallet)
- [x] Gas monitoring + auto-pause
- [x] Sweep dashboard with real-time progress
- [x] Transaction logging

### Phase 4 — Polish ✅
- [x] JSON export for logs
- [x] Log filtering (status, type, chain, wallet)
- [x] Log stats aggregation
- [x] Polling-based real-time updates for sweep & key derivation
