/**
 * routes/verify.js
 *
 * GET /verify?session_id=<uuid>
 *
 * Called by the gateway frontend every 10 seconds (via HTMX polling).
 * Checks on-chain for an incoming transaction to the session's deposit address.
 * On confirmation, credits the merchant's USD balance.
 *
 * Response:
 *   {
 *     session_id,
 *     status: 'pending' | 'confirmed' | 'expired',
 *     tx_hash?,
 *     usd_credited?,
 *     confirmed_at?
 *   }
 *
 * Idempotent: calling verify on an already-confirmed session returns
 * the same confirmed result without re-processing.
 */

const express = require('express');
const router = express.Router();

// const { checkIncomingEth } = require('../lib/chain');
const {checkIncomingUsdc} = require('../lib/chain')
const { usdtToUsd } = require('../lib/rates');
const { findTransaction, upsertTransaction, creditMerchant } = require('../lib/store');

router.get('/', async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'session_id query param is required.' });
  }

  const session = findTransaction(session_id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  // --- Already confirmed: return early (idempotent) ---
  if (session.status === 'confirmed') {
    return res.json({
      session_id: session.session_id,
      status: 'confirmed',
      tx_hash: session.tx_hash,
      usd_credited: session.usd_credited,
      confirmed_at: session.confirmed_at,
    });
  }

  // --- Check expiry ---
  const now = new Date();
  if (now > new Date(session.expires_at) && session.status === 'pending') {
    session.status = 'expired';
    upsertTransaction(session);
    return res.json({ session_id: session.session_id, status: 'expired' });
  }

  // --- Still expired from before ---
  if (session.status === 'expired') {
    return res.json({ session_id: session.session_id, status: 'expired' });
  }

  // --- Poll chain ---
  console.log(`[verify] Polling chain for session ${session_id} | address: ${session.deposit_address}`);

  const result = await checkIncomingUsdc(session.network, session.deposit_address);

  if (!result.found) {
    return res.json({ session_id: session.session_id, status: 'pending' });
  }
  if (parseFloat(result.value) < parseFloat(session.amount_usdt)) {
    console.log(`[verify] Underpayment detected for ${session_id}`);
    return res.json({ session_id: session.session_id, status: 'pending', error: 'insufficient_amount' });
}
  // --- Transaction found: confirm and credit ---
  const usdCredited = usdtToUsd(session.amount_usdt);
  const confirmedAt = new Date().toISOString();

  session.status = 'confirmed';
  session.tx_hash = result.tx_hash;
  session.confirmed_at = confirmedAt;
  session.usd_credited = usdCredited;

  upsertTransaction(session);
  creditMerchant(session.merchant_id, usdCredited);

  console.log(`[verify] Confirmed: ${session_id} | tx: ${result.tx_hash} | credited $${usdCredited} to ${session.merchant_id}`);

  return res.json({
    session_id: session.session_id,
    status: 'confirmed',
    tx_hash: result.tx_hash,
    usd_credited: usdCredited,
    confirmed_at: confirmedAt,
  });
});

module.exports = router;
