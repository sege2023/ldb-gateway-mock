/**
 * routes/initialize.js
 *
 * POST /initialize
 *
 * Called by the merchant's checkout page when user selects "Pay with Crypto".
 * Creates a payment session with a locked rate and a unique deposit address.
 *
 * Request:
 *   Headers: Authorization: Bearer <merchant_api_key>
 *   Body: { email: string, amount_ngn: number }
 *
 * Response:
 *   {
 *     session_id,
 *     merchant_id,
 *     email,
 *     amount_ngn,
 *     amount_usdt,
 *     display_rate,        ← NGN per USDT shown to user (OTC rate / 1.015)
 *     deposit_address,     ← unique HD wallet address for this session
 *     chain,
 *     network,
 *     expires_at,
 *     status
 *   }
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const { requireApiKey } = require('../lib/auth');
const { convertNgnToUsdt, DISPLAY_RATE } = require('../lib/rates');
const { deriveDepositAddress } = require('../lib/wallet');
const { readTransactions, upsertTransaction } = require('../lib/store');

const SESSION_TTL_MINUTES = 20;

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

  // --- Derive unique deposit address ---
  // Session index = current transaction count (gives deterministic, unique path per session)
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
    derivation_path: path,        // useful for debugging; omit in production response
    chain: 'Ethereum',
    network: 'sepolia',
    status: 'pending',
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    tx_hash: null,
    confirmed_at: null,
    usd_credited: null,
  };

  upsertTransaction(session);

  console.log(`[initialize] Session created: ${session.session_id} | ${email} | ₦${parsedAmount} | ${amountUsdt} USDC | ${address}`);

  return res.status(201).json(session);
});

module.exports = router;
