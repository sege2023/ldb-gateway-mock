/**
 * routes/generate-merchant.js
 *
 * POST /generate-merchant
 *
 * Generates a new merchant record with a cryptographically secure API key.
 * Uses Node's built-in `crypto` module (CSPRNG) — no external library needed.
 *
 * crypto.randomBytes(n) uses the OS CSPRNG (/dev/urandom on Linux).
 * This is the correct way to generate API keys, tokens, and secrets in Node.
 *
 * In production:
 * - Store only SHA-256(api_key) in the database, never the raw key.
 * - Return the raw key exactly once to the merchant — it cannot be recovered.
 * - Use a database with proper unique constraints on merchant_id and api_key_hash.
 *
 * Mock: store raw key in merchants.json. Sufficient for demo.
 *
 * Request:
 *   Body: { name: string }
 *
 * Response:
 *   { merchant_id, name, api_key, created_at }
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto'); // Node built-in — no install needed

const { readMerchants, writeMerchants } = require('../lib/store');

/**
 * Generate a secure random API key.
 * Format: ldb_test_sk_<32 random hex chars>
 * 32 bytes = 256 bits of entropy — sufficient for an API key.
 */
function generateApiKey() {
  const random = crypto.randomBytes(32).toString('hex'); // CSPRNG
  return `ldb_test_sk_${random}`;
}

/**
 * Generate a short merchant ID.
 * Format: merch_<8 random hex chars>
 */
function generateMerchantId() {
  const random = crypto.randomBytes(4).toString('hex');
  return `merch_${random}`;
}

router.post('/', (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Merchant name is required.' });
  }

  const merchants = readMerchants();

  const newMerchant = {
    merchant_id: generateMerchantId(),
    name: name.trim(),
    api_key: generateApiKey(),
    usd_balance: 0.00,
    created_at: new Date().toISOString(),
  };

  merchants.push(newMerchant);
  writeMerchants(merchants);

  console.log(`[generate-merchant] Created: ${newMerchant.merchant_id} | ${newMerchant.name}`);

  // Return full key here — in production this is the only time it's shown
  return res.status(201).json({
    merchant_id: newMerchant.merchant_id,
    name: newMerchant.name,
    api_key: newMerchant.api_key,
    created_at: newMerchant.created_at,
    note: 'Store this API key securely. In production it cannot be recovered.',
  });
});

module.exports = router;
