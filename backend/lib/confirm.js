/**
 * lib/confirm.js
 */

const { usdtToUsd } = require('./rates');
const { upsertTransaction, creditMerchant } = require('./store');

/**
 * @param {object} session
 * @param {{ tx_hash: string, value: string, network: string }} deposit
 */
function confirmSession(session, deposit) {
  // Idempotent
  if (session.status === 'confirmed') {
    return session;
  }

  const usdCredited = usdtToUsd(session.amount_usdt);
  const confirmedAt = new Date().toISOString();

  session.status = 'confirmed';
  session.network = deposit.network;          // ← which chain the user paid on
  session.tx_hash = deposit.tx_hash;
  session.confirmed_at = confirmedAt;
  session.usd_credited = usdCredited;

  // Activate sweep state machine
  session.sweep_status = 'unswept';
  session.sweep_tx_hash = null;
  session.swept_at = null;
  session.sweep_attempts = 0;
  session.sweep_last_error = null;

  // Optional: mark the winning network inside the networks map
  if (session.networks && session.networks[deposit.network]) {
    session.networks[deposit.network].status = 'confirmed';
  }

  upsertTransaction(session);
  creditMerchant(session.merchant_id, usdCredited);

  console.log(
    `[confirm] ${session.session_id} confirmed on ${deposit.network} | tx=${deposit.tx_hash} | sweep=unswept`
  );

  return session;
}

module.exports = { confirmSession };