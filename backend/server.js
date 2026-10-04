/**
 * server.js
 *
 * ldbAfrica Gateway Mock — Express server
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
});

const app = express();

// --- Middleware ---
app.use(cors());

// Important: webhook needs the raw body for signature verification.
// We mount the webhook route BEFORE the global json parser.
app.use('/webhook', require('./routes/webhook'));

// Normal JSON parsing for the rest of the API
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// --- API Routes ---
app.use('/initialize', require('./routes/initialize'));
app.use('/verify', require('./routes/verify'));
app.use('/generate-merchant', require('./routes/generate-merchant'));
app.use('/dashboard', require('./routes/dashboard'));

// --- Frontend page routes ---
app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/cart.html'));
});

app.get('/gateway', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/gateway.html'));
});

app.get('/merchant-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- 404 fallback ---
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// --- Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ldbAfrica Gateway Mock running on http://localhost:${PORT}`);
  console.log(`  Cart:       http://localhost:${PORT}/cart`);
  console.log(`  Dashboard:  http://localhost:${PORT}/merchant-dashboard`);
  console.log(`  Webhook:    http://localhost:${PORT}/webhook/alchemy`);

  startSweeper();
});

function startSweeper() {
  const { readTransactions } = require('./lib/store');
  const { sweepSession } = require('./lib/sweep');

  const POLL_INTERVAL_MS = 25_000;
  const MAX_ATTEMPTS = 8;
  let isRunning = false;

  async function processUnsweptSessions() {
    if (isRunning) return;
    isRunning = true;

    try {
      const all = readTransactions();
      const candidates = all.filter((s) => {
        if (s.status !== 'confirmed') return false;
        if (s.sweep_status === 'unswept') return true;
        if (s.sweep_status === 'sweep_failed' && (s.sweep_attempts || 0) < MAX_ATTEMPTS) {
          return true;
        }
        return false;
      });

      if (candidates.length === 0) {
        console.log('[sweeper] No sessions to sweep');
        return;
      }

      console.log(`[sweeper] Found ${candidates.length} session(s) to sweep`);

      for (const session of candidates) {
        try {
          await sweepSession(session);
        } catch (err) {
          console.error(`[sweeper] Error on ${session.session_id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[sweeper] Unexpected error:', err);
    } finally {
      isRunning = false;
    }
  }

  console.log('[sweeper] Starting inside server process…');
  console.log(`[sweeper] Treasury: ${process.env.TREASURY_ADDRESS}`);
  processUnsweptSessions();
  setInterval(processUnsweptSessions, POLL_INTERVAL_MS);
}

module.exports = app;