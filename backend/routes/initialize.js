/**
 * routes/initialize.js
 *
 * POST /initialize
 * Creates a payment session with locked rate + unique deposit address.
 * Supports multiple networks; the user can pay on any of them.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const { requireApiKey } = require('../lib/auth');
const { convertNgnToUsdt, DISPLAY_RATE } = require('../lib/rates');
const { deriveDepositAddress } = require('../lib/wallet');
const { readTransactions, upsertTransaction } = require('../lib/store');
const { registerSessionAddress } = require('../lib/alchemy');

const SESSION_TTL_MINUTES = 20;

// Networks that will be monitored for this session.
// Add/remove here as you expand support.
const SUPPORTED_NETWORKS = {
  sepolia: { chain: 'Ethereum', status: 'pending' },
  'base-sepolia': { chain: 'Base', status: 'pending' },
  'celo-sepolia': { chain: 'Celo', status: 'pending' },
  // amoy: { chain: 'Polygon', status: 'pending' }, // keep if you still want it
};

router.post('/', requireApiKey, (req, res) => {
  const { email, amount_ngn } = req.body;

  // --- Validation ---
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }

  const parsedAmount = parseFloat(amount_ngn);
  if (!amount_ngn || isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'amount_ngn must be a positive number.' });
  }

  // --- Derive unique deposit address (same address works on all EVM chains) ---
  const existingTxs = readTransactions();
  const sessionIndex = existingTxs.length;
  const { address, path } = deriveDepositAddress(sessionIndex);

  // --- Rate conversion ---
  const amountUsdt = convertNgnToUsdt(parsedAmount);

  // --- Build session ---
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000);

  const session = {
    session_id: uuidv4(),
    merchant_id: req.merchant.merchant_id,
    merchant_name: req.merchant.name,
    email,
    amount_ngn: parsedAmount,
    amount_usdt: amountUsdt,
    display_rate: parseFloat(DISPLAY_RATE.toFixed(4)),
    deposit_address: address,
    derivation_path: path,
    session_index: sessionIndex,

    // Multi-network support
    networks: { ...SUPPORTED_NETWORKS },
    network: null,                 // will be set on confirmation

    // Payment state machine
    status: 'pending',
    tx_hash: null,
    confirmed_at: null,
    usd_credited: null,

    // Sweep state machine (activated only after confirmation)
    sweep_status: 'not_applicable',
    sweep_tx_hash: null,
    swept_at: null,
    sweep_attempts: 0,
    sweep_last_error: null,
    sweep_gas_used: null,
    sweep_gas_price: null,

    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  upsertTransaction(session);

  // Register the new deposit address with Alchemy webhooks (non-blocking)
  registerSessionAddress(session).catch((err) =>
    console.error('[initialize] Alchemy registration failed:', err.message)
  );
  console.log(
    `[initialize] ${session.session_id} | ${email} | ₦${parsedAmount} | ${amountUsdt} USDC | ${address}`
  );

  return res.status(201).json(session);
});

module.exports = router;