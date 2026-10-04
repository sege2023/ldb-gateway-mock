// /**
//  * routes/verify.js
//  *
//  * GET /verify?session_id=<uuid>
//  *
//  * Polls every network listed in session.networks.
//  * On first valid payment → confirmSession() (credits merchant + sets sweep_status = 'unswept').
//  */

// const express = require('express');
// const router = express.Router();

// const { checkIncomingUsdc } = require('../lib/chain');
// const { findTransaction, upsertTransaction } = require('../lib/store');
// const { confirmSession } = require('../lib/confirm');

// router.get('/', async (req, res) => {
//   const { session_id } = req.query;

//   if (!session_id) {
//     return res.status(400).json({ error: 'session_id query param is required.' });
//   }

//   const session = findTransaction(session_id);
//   if (!session) {
//     return res.status(404).json({ error: 'Session not found.' });
//   }

//   // --- Already confirmed (idempotent) ---
//   if (session.status === 'confirmed') {
//     return res.json({
//       session_id: session.session_id,
//       status: 'confirmed',
//       network: session.network,
//       tx_hash: session.tx_hash,
//       usd_credited: session.usd_credited,
//       confirmed_at: session.confirmed_at,
//       sweep_status: session.sweep_status,
//     });
//   }

//   // --- Expiry check ---
//   const now = new Date();
//   if (now > new Date(session.expires_at) && session.status === 'pending') {
//     session.status = 'expired';
//     upsertTransaction(session);
//     return res.json({ session_id: session.session_id, status: 'expired' });
//   }

//   if (session.status === 'expired') {
//     return res.json({ session_id: session.session_id, status: 'expired' });
//   }

//   // --- Poll every supported network ---
//   const supportedNetworks = Object.keys(session.networks || {});

//   for (const net of supportedNetworks) {
//     console.log(`[verify] Polling ${net} for ${session.deposit_address}`);

//     const result = await checkIncomingUsdc(net, session.deposit_address);

//     if (!result?.found) continue;

//     // Underpayment → keep looking on other chains / later polls
//     if (parseFloat(result.value) < parseFloat(session.amount_usdt)) {
//       console.log(
//         `[verify] Underpayment on ${net}: expected ${session.amount_usdt}, got ${result.value}`
//       );
//       continue;
//     }

//     // Valid payment found on this network
//     const confirmed = confirmSession(session, {
//       tx_hash: result.tx_hash,
//       value: result.value,
//       network: net,                 // important for the sweeper
//     });

//     return res.json({
//       session_id: confirmed.session_id,
//       status: 'confirmed',
//       network: confirmed.network,
//       tx_hash: confirmed.tx_hash,
//       usd_credited: confirmed.usd_credited,
//       confirmed_at: confirmed.confirmed_at,
//       sweep_status: confirmed.sweep_status,
//     });
//   }

//   // Nothing found yet
//   return res.json({ session_id: session.session_id, status: 'pending' });
// });

// module.exports = router;
const express = require('express');
const router = express.Router();
const { findTransaction } = require('../lib/store');

router.get('/', async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'session_id query param is required.' });
  }

  const session = findTransaction(session_id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  // Just return current DB state – no chain polling
  return res.json({
    session_id: session.session_id,
    status: session.status,
    network: session.network,
    tx_hash: session.tx_hash,
    usd_credited: session.usd_credited,
    confirmed_at: session.confirmed_at,
    sweep_status: session.sweep_status,
  });
});

module.exports = router;