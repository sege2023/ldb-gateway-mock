/**
 * lib/wallet.js
 *
 * HD wallet address derivation using BIP-44.
 *
 * Derivation path: m/44'/60'/0'/0/{sessionIndex}
 * coin_type 60 = Ethereum / EVM-compatible chains (Sepolia, BNB, Amoy etc.)
 *
 * In production:
 * - Mnemonic stored in AWS KMS or Fireblocks — never in env files committed to git.
 * - Private keys never returned from this module except for sweep signing.
 * - Each chain gets its own coin_type index.
 *
 * Mock: mnemonic in .env. .
 */

const bip39 = require('bip39');
const HDKey = require('hdkey');
const { ethers } = require('ethers');

// In production this comes from a secrets manager, never from source code.
const MNEMONIC = process.env.MNEMONIC?.trim();

console.log("=== MNEMONIC DEBUG ===");
console.log("MNEMONIC exists:", !!MNEMONIC);

if (!MNEMONIC) {
  throw new Error('MNEMONIC environment variable is missing from .env file');
}

if (!bip39.validateMnemonic(MNEMONIC)) {
  throw new Error('Invalid mnemonic in environment. Check MNEMONIC env var.');
}

console.log("✅ Mnemonic validation passed!");

const seed = bip39.mnemonicToSeedSync(MNEMONIC);
const root = HDKey.fromMasterSeed(seed);

/**
 * Derive a deterministic deposit address for a given session index.
 * Same index always produces the same address — deterministic by design.
 *
 * @param {number} sessionIndex - auto-incrementing integer per session
 * @returns {{ address: string, path: string }}
 */
function deriveDepositAddress(sessionIndex) {
  const path = `m/44'/60'/0'/0/${sessionIndex}`;
  const child = root.derive(path);
  const wallet = new ethers.Wallet('0x' + child.privateKey.toString('hex'));
  return {
    address: wallet.address,
    path,
  };
}

module.exports = { deriveDepositAddress };
