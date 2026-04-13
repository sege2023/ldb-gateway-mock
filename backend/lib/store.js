/**
 * lib/store.js
 *
 * Simple JSON file-based persistence layer.
 *
 * In production: PostgreSQL with proper transactions, row-level locking,
 * and idempotency constraints (unique index on tx_hash).
 *
 * Mock: synchronous JSON read/write.
 * Not safe for concurrent writes in production.
 */

const fs = require('fs');
const path = require('path');

const MERCHANTS_PATH = path.join(__dirname, '../data/merchants.json');
const TRANSACTIONS_PATH = path.join(__dirname, '../data/transactions.json');

function readMerchants() {
  return JSON.parse(fs.readFileSync(MERCHANTS_PATH, 'utf8'));
}

function writeMerchants(data) {
  fs.writeFileSync(MERCHANTS_PATH, JSON.stringify(data, null, 2));
}

function readTransactions() {
  return JSON.parse(fs.readFileSync(TRANSACTIONS_PATH, 'utf8'));
}

function writeTransactions(data) {
  fs.writeFileSync(TRANSACTIONS_PATH, JSON.stringify(data, null, 2));
}

function findTransaction(sessionId) {
  return readTransactions().find((t) => t.session_id === sessionId) || null;
}

function upsertTransaction(updated) {
  const all = readTransactions();
  const idx = all.findIndex((t) => t.session_id === updated.session_id);
  if (idx === -1) {
    all.push(updated);
  } else {
    all[idx] = updated;
  }
  writeTransactions(all);
}

function creditMerchant(merchantId, amountUsd) {
  const merchants = readMerchants();
  const idx = merchants.findIndex((m) => m.merchant_id === merchantId);
  if (idx !== -1) {
    merchants[idx].usd_balance = parseFloat(
      (merchants[idx].usd_balance + amountUsd).toFixed(6)
    );
    writeMerchants(merchants);
  }
}

module.exports = {
  readMerchants,
  writeMerchants,
  readTransactions,
  writeTransactions,
  findTransaction,
  upsertTransaction,
  creditMerchant,
};
