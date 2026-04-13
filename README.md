# ldbAfrica Gateway — Mock Implementation

A working proof-of-concept of the ldbAfrica crypto payment gateway. Demonstrates the core payment flow: merchant checkout → payment session initialization → on-chain transaction detection → merchant dashboard settlement.

Built as a client-facing evaluation mock. Not production code.

---

## What This Demonstrates

- **HD wallet address derivation** (BIP-44) — unique deposit address generated per payment session
- **Rate locking** — NGN amount converted to ETH at session creation using a buffered fixed rate
- **On-chain transaction detection** — polls Sepolia testnet RPC for incoming ETH to the session address
- **Merchant ledger** — USD balance credited on confirmation
- **Merchant dashboard** — API key authenticated; shows transaction history and balance
- **CSPRNG API key generation** — using Node's built-in `crypto.randomBytes`

---

## Flow

```
/cart  →  POST /initialize  →  /gateway  →  GET /verify (polls)  →  confirmed
                                                                       │
                                                              merchant dashboard updated
```

1. User enters email and NGN amount on `/cart`
2. Frontend calls `POST /initialize` with merchant API key → server derives HD wallet address, locks rate, creates session
3. User is redirected to `/gateway` — sees deposit address, amount in ETH, countdown timer
4. Gateway polls `GET /verify` every 10 seconds
5. Server scans Sepolia blocks for incoming ETH to the deposit address
6. On detection → session confirmed → merchant USD balance credited
7. Merchant views `/merchant-dashboard` with API key → sees transaction history

---

## Getting Started

### Prerequisites

- Node.js 18+ (built-in `fetch` required for tests)
- Sepolia ETH for a real on-chain test ([faucet](https://sepoliafaucet.com))

### Install

```bash
git clone <repo>
cd ldb-gateway-mock
npm install
```

### Run

```bash
npm run dev
```

Server starts at `http://localhost:3000`

| URL | Description |
|---|---|
| `/cart` | Merchant checkout page |
| `/gateway?session_id=<id>` | Payment gateway |
| `/merchant-dashboard` | Merchant dashboard |

### Test

```bash
# In a separate terminal while server is running
node tests/api.test.js
```

---

## API Reference

### `POST /initialize`

Creates a payment session. Called by the merchant's checkout when user selects "Pay with Crypto."

**Headers:** `Authorization: Bearer <merchant_api_key>`

**Body:**
```json
{
  "email": "user@example.com",
  "amount_ngn": 5000
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "merchant_id": "merch_001",
  "email": "user@example.com",
  "amount_ngn": 5000,
  "amount_usdt": 3.407,
  "display_rate": 1467.49,
  "deposit_address": "0x...",
  "chain": "Ethereum",
  "network": "Sepolia Testnet",
  "status": "pending",
  "created_at": "...",
  "expires_at": "... +20min"
}
```

---

### `GET /verify?session_id=<uuid>`

Checks on-chain for incoming transaction to the session address. Called by the gateway frontend every 10 seconds.

**Response (pending):**
```json
{ "session_id": "...", "status": "pending" }
```

**Response (confirmed):**
```json
{
  "session_id": "...",
  "status": "confirmed",
  "tx_hash": "0x...",
  "usd_credited": 3.407,
  "confirmed_at": "..."
}
```

**Response (expired):**
```json
{ "session_id": "...", "status": "expired" }
```

---

### `POST /generate-merchant`

Generates a new merchant with a CSPRNG API key.

**Body:**
```json
{ "name": "My Store" }
```

**Response:**
```json
{
  "merchant_id": "merch_a3f7c2b1",
  "name": "My Store",
  "api_key": "ldb_test_sk_<64 hex chars>",
  "created_at": "..."
}
```

---

### `GET /dashboard`

Returns transaction history and balance for the authenticated merchant.

**Headers:** `Authorization: Bearer <merchant_api_key>`

**Response:**
```json
{
  "merchant_id": "merch_001",
  "name": "Ade's Electronics",
  "usd_balance": 3.41,
  "transaction_count": 1,
  "transactions": [...]
}
```

---

## Rate Logic

```
OTC mock executable rate:  1,490 NGN/USDT
Margin factor:             1.015 (1.5%)
Display rate to user:      1,490 / 1.015 = 1,467.49 NGN/USDT

User pays:  amount_ngn / display_rate = USDT required
Gateway collects USDT, OTC desk gives NGN at 1,490
Merchant receives full NGN amount, gateway keeps the spread
```

In production, the OTC executable rate comes from the Yellow Card / AZA Finance API at session creation time, not a hardcoded constant.

---

## Project Structure

```
ldb-gateway-mock/
├── backend/
│   ├── server.js                  # Express entry point
│   ├── routes/
│   │   ├── initialize.js          # POST /initialize
│   │   ├── verify.js              # GET /verify
│   │   ├── generate-merchant.js   # POST /generate-merchant
│   │   └── dashboard.js           # GET /dashboard
│   ├── lib/
│   │   ├── wallet.js              # HD wallet derivation (BIP-44)
│   │   ├── rates.js               # Rate conversion logic
│   │   ├── chain.js               # Sepolia RPC polling
│   │   ├── auth.js                # API key middleware
│   │   └── store.js               # JSON file persistence
│   └── data/
│       ├── merchants.json         # Merchant records
│       └── transactions.json      # Session/transaction records
├── frontend/
│   ├── cart.html                  # Merchant checkout page
│   ├── gateway.html               # Payment gateway UI
│   └── dashboard.html             # Merchant dashboard
├── tests/
│   └── api.test.js                # API test suite (no framework)
└── README.md
```

---

## Mock Scope & Known Omissions

This is a demonstration build. The following are intentionally excluded and documented here for transparency.

| Omission | Production Equivalent |
|---|---|
| API keys stored in plaintext JSON | SHA-256 hashed keys in PostgreSQL with unique constraint |
| No rate limiting on endpoints | Redis-based rate limiting per IP and per API key |
| Fixed mock OTC rate | Live OTC executable quote from Yellow Card / AZA Finance API |
| Native ETH detected, not ERC-20 | ERC-20 Transfer event log scanning via `provider.getLogs()` |
| No overpayment / underpayment handling | ±1% tolerance check; exceptions queue for out-of-range amounts |
| No sweep to treasury wallet | Post-confirmation transfer from session address to cold treasury wallet |
| USDT treated as exactly $1.00 | 24hr VWAP from Binance API; depeg circuit breaker at $0.995 |
| Polling only, no webhooks | Alchemy/TronGrid webhook subscriptions as primary; polling as fallback |
| JSON file store (not concurrent-safe) | PostgreSQL with row-level locking and idempotency constraints on `tx_hash` |
| No HTTPS | TLS termination at load balancer (nginx / Cloudflare) |
| Mnemonic in env var / hardcoded | AWS KMS or Fireblocks for key management |
| No OFAC / AML screening | TRM Labs API — address screened before every credit |
| Session data fetched via dashboard API in gateway page | Dedicated `GET /session/:id` endpoint (public, no auth needed) |
| No webhook delivery to merchant | HMAC-SHA256 signed webhook with exponential backoff retry |

---

## Architecture Reference

See [`ldb-gateway.md`](./ldb-gateway.md) for the full production architecture document covering all modules, failure points, V2 roadmap, and technology stack decisions.
