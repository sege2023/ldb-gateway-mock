/**
 * routes/webhook.js
 *
 * POST /webhook/alchemy
 *
 * Receives Alchemy Address Activity webhooks.
 * When a USDC Transfer to one of our deposit addresses is detected,
 * we look up the matching session and run confirmSession().
 *
 * For the mock we keep signature verification optional so you can test
 * without setting up the webhook secret immediately.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { findTransactionByAddress, upsertTransaction } = require('../lib/store');
const { confirmSession } = require('../lib/confirm');
const { getNetworkConfig } = require('../lib/chain');

const WEBHOOK_SECRET = process.env.ALCHEMY_WEBHOOK_SECRET; // optional for mock

/**
 * Very lightweight helper – you will need to add this to store.js
 * (shown below).
 */
function findTransactionByDepositAddress(address) {
  // This function must be added to lib/store.js
  const { readTransactions } = require('../lib/store');
  return readTransactions().find(
    (t) => t.deposit_address?.toLowerCase() === address.toLowerCase()
  ) || null;
}

router.post('/alchemy', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // ---------- Optional signature verification ----------
    if (WEBHOOK_SECRET) {
      const signature = req.headers['x-alchemy-signature'];
      if (!signature) {
        return res.status(401).json({ error: 'Missing signature' });
      }
      const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
      hmac.update(req.body);
      const digest = hmac.digest('hex');
      if (digest !== signature) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const payload = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString())
      : req.body;

    // Alchemy Address Activity format
    const activities = payload?.event?.activity || [];

    for (const activity of activities) {
      // We only care about ERC-20 transfers
      if (activity.category !== 'token' && activity.category !== 'erc20') continue;

      const toAddress = activity.toAddress;
      const value = activity.value;               // already human-readable in most Alchemy payloads
      const txHash = activity.hash;
      const asset = activity.asset;               // "USDC"
      const network = mapAlchemyNetwork(payload?.event?.network || activity.network);

      if (!toAddress || !txHash) continue;

      const session = findTransactionByDepositAddress(toAddress);
      if (!session) {
        console.log(`[webhook] No session for address ${toAddress}`);
        continue;
      }

      if (session.status === 'confirmed' || session.status === 'expired') {
        continue; // already handled
      }

      // Basic amount check (Alchemy value is usually in token units)
      const received = parseFloat(value);
      if (isNaN(received) || received < parseFloat(session.amount_usdt)) {
        console.log(`[webhook] Underpayment or unparseable value for ${session.session_id}`);
        continue;
      }

      // Confirm
      confirmSession(session, {
        tx_hash: txHash,
        value: String(received),
        network,
      });

      console.log(`[webhook] Confirmed ${session.session_id} on ${network} via Alchemy`);
    }

    // Always acknowledge quickly
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook] Error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * Map Alchemy network names to our internal keys
 */
function mapAlchemyNetwork(alchemyNet) {
  if (!alchemyNet) return 'sepolia';
  const n = alchemyNet.toLowerCase();
  if (n.includes('base')) return 'base-sepolia';
  if (n.includes('celo')) return 'celo-sepolia';
  if (n.includes('polygon') || n.includes('amoy')) return 'amoy';
  return 'sepolia';
}

module.exports = router;