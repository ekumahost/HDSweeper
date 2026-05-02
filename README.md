# HDSWEEPER

**HD Wallet Sweep Tool** — Automatically sweep ERC-20 tokens and native assets from HD-derived wallets across multiple EVM chains into a single custodial destination.

---

## Overview

HDSWEEPER derives wallets from a BIP-44 mnemonic, scans them for token and native balances across supported EVM chains, and sweeps everything to your custodial wallet. It handles gas distribution, parallel chain processing, checkpoint-based pause/resume, and runs unattended with a built-in cron scheduler.

### Key Features

- **Multi-chain parallel sweeping** — Ethereum, BNB Smart Chain, Arbitrum, Base, Asset Chain (extensible)
- **50+ pre-seeded ERC-20 tokens** — USDT, USDC, WETH, WBTC, DAI, and more across all chains
- **HD key derivation** — Derive up to 200,000+ wallet indexes from a single mnemonic
- **Gas management** — Auto-funds target wallets from a gas wallet, returns unused gas
- **Checkpoint & resume** — Pause mid-sweep, resume from exactly where it stopped
- **Dead RPC detection** — Tests each RPC before job creation and during sweeps; skips unreachable chains
- **Direct sweeper automation** — Start once from Dashboard, then it runs forever from DB toggle and executes daily at 07:00 UTC
- **AES-256 encrypted mnemonic** — Private keys are never stored; derived on-the-fly
- **Dark-themed web UI** — 10-tab SPA for full control and monitoring
- **Env-based bootstrap** — Set mnemonic in `.env` for zero-touch startup

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Server | [Hapi.js](https://hapi.dev/) v21 (TypeScript) |
| Database | MongoDB via Mongoose v7 |
| Blockchain | ethers.js v5 |
| Frontend | Vanilla HTML / CSS / JS (dark SPA) |
| Runtime | Node.js 18+ |

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **MongoDB** running on `127.0.0.1:27017`

### Install

```bash
git clone <repo-url> HDSWEEPER
cd HDSWEEPER
npm install
```

### Configure

Copy and edit the environment file:

```bash
cp .env.example .env
```

```env
MONGODB_URI=mongodb://127.0.0.1:27017/HDSweeper
PORT=4900
HOST=127.0.0.1
ENCRYPTION_KEY=<random-64-char-hex-string>
MNEMONIC=word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
CUSTODIAL_WALLET=0xYourCustodialAddressHere
ENABLE_CRON=true
DIRECT_SWEEP_HOUR_UTC=7
DIRECT_SWEEP_MINUTE_UTC=0
UNREMITTED_BALANCES_BASE_URL=https://mobilelab.xend.africa
DIRECT_SWEEP_DERIVATION_SEARCH_WINDOW=20000
DIRECT_SWEEP_DERIVATION_MAX_INDEX=500000
```

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/HDSweeper` | MongoDB connection string |
| `PORT` | `4900` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `ENCRYPTION_KEY` | — | AES-256 key for mnemonic encryption (min 32 chars) |
| `MNEMONIC` | *(empty)* | 12-word BIP-39 mnemonic. If set, auto-imports on first run and triggers setup (gas wallet, custodial, key derivation). Leave empty to enter via the UI instead |
| `CUSTODIAL_WALLET` | `0x6d29...5A2` | Destination address for all swept funds. Falls back to a hardcoded default if empty |
| `ENABLE_CRON` | `true` | Set `false` to disable automatic direct sweeper scheduling |
| `DIRECT_SWEEP_HOUR_UTC` | `7` | Optional. Hour (UTC) for daily DIRECT SWEEPER run; hardcoded default is `7` |
| `DIRECT_SWEEP_MINUTE_UTC` | `0` | Optional. Minute (UTC) for daily DIRECT SWEEPER run; hardcoded default is `0` |
| `UNREMITTED_BALANCES_BASE_URL` | `https://mobilelab.xend.africa` | Optional. Hook integration base URL; hardcoded default points to production |
| `DIRECT_SWEEP_DERIVATION_SEARCH_WINDOW` | `20000` | Optional. How many new HD indexes DIRECT SWEEPER should derive per cycle when a wallet is missing |
| `DIRECT_SWEEP_DERIVATION_MAX_INDEX` | `500000` | Optional. Upper safety limit for auto-expanded HD derivation search |

### Run

**Development:**

```bash
npm run dev
```

**Production:**

```bash
npm run build
npm start
```

Open [http://127.0.0.1:4900](http://127.0.0.1:4900) in your browser.

---

## Startup Sequence

1. Connect to MongoDB
2. Seed default RPCs, tokens, and custodial wallet
3. If `MNEMONIC` env var is set and DB has no mnemonic → encrypt & store it, then auto-setup:
   - Set gas wallet (index 0)
   - Set custodial destination
   - Derive 200,000 wallet indexes
  - Do not create legacy sweep jobs automatically; start them manually when needed
4. Start Hapi server
5. Start cron scheduler (DIRECT SWEEPER runs only when DB toggle is enabled, then daily at 07:00 UTC)

---

## UI Tabs

| Tab | Purpose |
|-----|---------|
| **Dashboard** | Overview and status at a glance |
| **Setup** | Mnemonic and custodial wallet configuration |
| **Gas Wallet** | Gas funder balance across all chains |
| **Contracts** | Manage tracked ERC-20 token contracts |
| **RPCs** | Add, edit, and toggle RPC endpoints per chain |
| **Key Derivation** | Derive HD wallets, paginated list with search |
| **Wallets** | Import wallet lists via paste or CSV upload |
| **Sweep Jobs** | Create, start, pause, resume, and monitor sweeps |
| **Logs** | Per-job transaction logs with status and errors |

---

## Sweep Flow

```
For each chain (in parallel):
  ├─ Build chain context (provider, gas wallet, custodial, tokens)
  ├─ For each wallet batch (10 wallets):
  │   ├─ Check native + ERC-20 balances
  │   ├─ Fund gas from gas wallet (estimated amount)
  │   ├─ Sweep all ERC-20 tokens → custodial
  │   ├─ Sweep remaining native balance → custodial
  │   ├─ Return unused gas → gas wallet
  │   └─ Checkpoint progress
  └─ Report results per chain
```

**Resilience:**
- One dead chain doesn't stop the others
- Gas depletion pauses gracefully with resume support
- Partial completion is tracked: `completed with notes`, `gas_depleted`, `paused`, `failed`

---

## Supported Chains

| Chain | ID | Native |
|-------|----|--------|
| Ethereum | 1 | ETH |
| BNB Smart Chain | 56 | BNB |
| Arbitrum One | 42161 | ETH |
| Base | 8453 | ETH |
| Asset Chain | 42420 | RWA |

Add more chains via the **RPCs** tab in the UI.

---

## Project Structure

```
src/
├── server.ts              # Hapi server, boot sequence
├── config/
│   ├── database.ts        # MongoDB connection
│   └── seed.ts            # Default RPCs, tokens, custodial wallet
├── models/                # Mongoose schemas
│   ├── AppConfig.ts       # Key-value config store
│   ├── DerivedKey.ts      # address ↔ index mappings
│   ├── GasWallet.ts       # Gas funder wallet + balances
│   ├── RpcEndpoint.ts     # Chain RPC endpoints
│   ├── SweepJob.ts        # Sweep job state + progress
│   ├── SweepLog.ts        # Per-tx sweep logs
│   ├── TokenContract.ts   # Tracked ERC-20 contracts
│   ├── WalletAddress.ts   # Imported wallet addresses
│   └── WalletList.ts      # Named wallet list groups
├── routes/                # Hapi route handlers
│   ├── config.ts          # Mnemonic, custodial, auto-setup
│   ├── contracts.ts       # Token CRUD
│   ├── gas.ts             # Gas wallet management
│   ├── keys.ts            # Key derivation + listing
│   ├── logs.ts            # Sweep log queries
│   ├── rpcs.ts            # RPC CRUD
│   ├── sweep.ts           # Job CRUD + start/pause/resume
│   └── wallets.ts         # Wallet list import (paste/CSV)
├── services/
│   ├── blockchain.ts      # Provider management, balance checks, RPC validation
│   ├── directSweeper.ts   # Unremitted-balances sync + direct sweep orchestration
│   ├── keyDerivation.ts   # HD derivation, encryption, bulk derive
│   ├── sweeper.ts         # Core sweep engine
│   └── cron.ts            # DIRECT SWEEPER scheduler (startup + daily run)
└── public/                # Static SPA frontend
    ├── index.html
    ├── css/style.css
    └── js/
        ├── api.js         # HTTP client
        ├── app.js         # SPA router
        ├── components.js  # Shared UI helpers
        └── pages/         # Per-tab page modules
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with ts-node (development) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm run seed` | Re-seed default data |

---

## Security

- **Mnemonic encryption**: AES-256-CBC with configurable key. Stored encrypted in MongoDB.
- **No private key storage**: Keys are derived in-memory from the mnemonic and discarded after use.
- **Localhost-only by default**: Server binds to `127.0.0.1`. Change `HOST` only if you understand the risk.
- **Environment-based secrets**: Mnemonic and encryption key loaded from `.env`, never hardcoded.

> **Warning**: This tool handles real cryptocurrency. Run it on a secure, trusted machine. Do not expose the server to the public internet.

---

## License

ISC
