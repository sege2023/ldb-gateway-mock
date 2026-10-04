/**
 * lib/wallet.js
 *
 * HD wallet address + private key derivation using BIP-44.
 *
 * Path: m/44'/60'/0'/0/{sessionIndex}
 *
 * In production:
 * - Mnemonic lives in KMS / HSM / Fireblocks
 * - derivePrivateKey is only ever called by the sweeper worker
 */

const bip39 = require('bip39');
const HDKey = require('hdkey');
const { ethers } = require('ethers');

const MNEMONIC = process.env.MNEMONIC?.trim();

if (!MNEMONIC) {
  throw new Error('MNEMONIC environment variable is missing');
}

if (!bip39.validateMnemonic(MNEMONIC)) {
  throw new Error('Invalid mnemonic in environment');
}

const seed = bip39.mnemonicToSeedSync(MNEMONIC);
const root = HDKey.fromMasterSeed(seed);

/**
 * Derive a deterministic deposit address for a given session index.
 * @param {number} sessionIndex
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

/**
 * Derive the private key for a session index.
 * ONLY used by the sweeper worker. Never expose via API.
 * @param {number} sessionIndex
 * @returns {string} 0x-prefixed private key
 */
function derivePrivateKey(sessionIndex) {
  const path = `m/44'/60'/0'/0/${sessionIndex}`;
  const child = root.derive(path);
  return '0x' + child.privateKey.toString('hex');
}

module.exports = {
  deriveDepositAddress,
  derivePrivateKey,
};