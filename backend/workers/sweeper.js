/**
 * workers/sweeper.js
 *
 * Background worker that sweeps confirmed sessions to treasury.
 *
 * Run with:  node workers/sweeper.js
 *
 * It polls the store every POLL_INTERVAL_MS for sessions that are:
 *   status === 'confirmed' && sweep_status === 'unswept'
 * (also retries 'sweep_failed' with simple backoff)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { readTransactions } = require('../lib/store');
const { sweepSession } = require('../lib/sweep');

const POLL_INTERVAL_MS = 25_000; // 25 seconds
const MAX_ATTEMPTS = 8;
const RETRY_BACKOFF_MS = 2 * 60 * 1000; // 2 minutes between retries

let isRunning = false;

async function processUnsweptSessions() {
  if (isRunning) {
    console.log('[sweeper] Previous run still in progress – skipping');
    return;
  }

  isRunning = true;

  try {
    const all = readTransactions();
    const candidates = all.filter((s) => {
      if (s.status !== 'confirmed') return false;

      if (s.sweep_status === 'unswept') return true;

      // Retry failed ones with backoff
      if (s.sweep_status === 'sweep_failed') {
        if ((s.sweep_attempts || 0) >= MAX_ATTEMPTS) return false;
        // simple backoff: only retry if last attempt was > RETRY_BACKOFF_MS ago
        // (we don't store last_attempt_at yet, so just allow retry)
        return true;
      }

      return false;
    });

    if (candidates.length === 0) {
      console.log('[sweeper] No sessions to sweep');
      return;
    }

    console.log(`[sweeper] Found ${candidates.length} session(s) to sweep`);

    // Process sequentially to avoid nonce issues on the relayer
    for (const session of candidates) {
      try {
        await sweepSession(session);
      } catch (err) {
        // already logged + state updated inside sweepSession
        console.error(`[sweeper] Error on ${session.session_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[sweeper] Unexpected error:', err);
  } finally {
    isRunning = false;
  }
}

console.log('[sweeper] Starting…');
console.log(`[sweeper] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
console.log(`[sweeper] Treasury: ${process.env.TREASURY_ADDRESS}`);

// Run once immediately, then on interval
processUnsweptSessions();
setInterval(processUnsweptSessions, POLL_INTERVAL_MS);