/**
 * routes/dashboard.js
 *
 * GET /dashboard
 *
 * Returns all transactions and current balance for the authenticated merchant.
 * Used by the merchant dashboard frontend.
 *
 * Request:
 *   Headers: Authorization: Bearer <api_key>
 *
 * Response:
 *   {
 *     merchant_id,
 *     name,
 *     usd_balance,
 *     transactions: [ ...session objects ]
 *   }
 */

const express = require('express');
const router = express.Router();

const { requireApiKey } = require('../lib/auth');
const { readTransactions, readMerchants } = require('../lib/store');

router.get('/', requireApiKey, (req, res) => {
  const merchant = req.merchant;

  const allTxs = readTransactions();
  const merchantTxs = allTxs
    .filter((t) => t.merchant_id === merchant.merchant_id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // newest first

  // Re-read merchant for up-to-date balance
  const { readMerchants } = require('../lib/store');
  const merchants = readMerchants();
  const fresh = merchants.find((m) => m.merchant_id === merchant.merchant_id);

  return res.json({
    merchant_id: fresh.merchant_id,
    name: fresh.name,
    usd_balance: fresh.usd_balance,
    transaction_count: merchantTxs.length,
    transactions: merchantTxs.map((t) => ({
      session_id: t.session_id,
      email: t.email,
      amount_ngn: t.amount_ngn,
      amount_usdt: t.amount_usdt,
      usd_credited: t.usd_credited,
      status: t.status,
      tx_hash: t.tx_hash,
      chain: t.chain,
      network: t.network,
      deposit_address: t.deposit_address,
      created_at: t.created_at,
      confirmed_at: t.confirmed_at,
    })),
  });
});

module.exports = router;
