/**
 * lib/auth.js
 *
 * API key authentication middleware.
 *
 * In production:
 * - Keys are stored as SHA-256 hashes in the database.
 * - Incoming key is hashed on receipt and compared — raw key never stored.
 * - Keys are prefixed (ldb_live_sk_ / ldb_test_sk_) for environment separation.
 *
 * Mock: plaintext comparison against merchants.json. Sufficient for demo.
 */

const { readMerchants } = require('./store');

/**
 * Express middleware. Validates Authorization: Bearer <api_key> header.
 * Attaches merchant object to req.merchant on success.
 */
function requireApiKey(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or malformed Authorization header. Expected: Bearer <api_key>',
    });
  }

  const apiKey = authHeader.slice(7); // strip "Bearer "
  const merchants = readMerchants();
  const merchant = merchants.find((m) => m.api_key === apiKey);

  if (!merchant) {
    return res.status(401).json({ error: 'Invalid API key.' });
  }

  req.merchant = merchant;
  next();
}

module.exports = { requireApiKey };
