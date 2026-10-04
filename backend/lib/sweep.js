/**
 * lib/sweep.js
 *
 * EIP-2612 Permit + Relayer sweep.
 *
 * Flow:
 * 1. Session key signs an off-chain permit allowing the Relayer to move USDC
 * 2. Relayer submits permit() + transferFrom() in one transaction and pays gas
 * 3. USDC moves from session address → treasury
 */

const { ethers } = require('ethers');
const { derivePrivateKey } = require('./wallet');
const { getNetworkConfig, getProvider, getUsdcContract } = require('./chain');
const { upsertTransaction } = require('./store');

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;

if (!TREASURY_ADDRESS) {
  throw new Error('TREASURY_ADDRESS is required');
}
if (!RELAYER_PRIVATE_KEY) {
  throw new Error('RELAYER_PRIVATE_KEY is required');
}

/**
 * Execute a sweep for a confirmed session.
 * @param {object} session
 * @returns {Promise<object>} updated session
 */
async function sweepSession(session) {
  if (session.status !== 'confirmed') {
    throw new Error('Can only sweep confirmed sessions');
  }
  if (session.sweep_status === 'swept') {
    return session; // already done
  }

  const sessionIndex = extractSessionIndex(session);
  const network = session.network || 'sepolia';

  // Mark as sweeping
  session.sweep_status = 'sweeping';
  session.sweep_attempts = (session.sweep_attempts || 0) + 1;
  upsertTransaction(session);

  try {
    const cfg = getNetworkConfig(network);
    const provider = getProvider(network);
    const relayer = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
    const usdc = getUsdcContract(network, relayer);

    // 1. Get current USDC balance of the session address
    const balance = await usdc.balanceOf(session.deposit_address);
    if (balance === 0n) {
      throw new Error('Session address has zero USDC balance');
    }

    // 2. Build and sign the EIP-2612 permit with the session key
    const sessionWallet = new ethers.Wallet(derivePrivateKey(sessionIndex), provider);
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const nonce = await usdc.nonces(session.deposit_address);

    const domain = {
      name: await usdc.name(),
      version: await usdc.version().catch(() => '2'), // most Circle USDC use "2"
      chainId: cfg.chainId,
      verifyingContract: cfg.usdc,
    };

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const value = {
      owner: session.deposit_address,
      spender: relayer.address,
      value: balance,
      nonce,
      deadline,
    };

    const signature = await sessionWallet.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(signature);

    // 3. Relayer submits permit + transferFrom
    const permitTx = await usdc.permit(
      session.deposit_address,
      relayer.address,
      balance,
      deadline,
      v,
      r,
      s
    );
    await permitTx.wait();

    const transferTx = await usdc.transferFrom(
      session.deposit_address,
      TREASURY_ADDRESS,
      balance
    );
    const receipt = await transferTx.wait();

    // Success
    session.sweep_status = 'swept';
    session.sweep_tx_hash = receipt.hash;
    session.swept_at = new Date().toISOString();
    session.sweep_last_error = null;

    // Optional: record gas cost for your mockup reporting
    session.sweep_gas_used = receipt.gasUsed.toString();
    session.sweep_gas_price = receipt.gasPrice?.toString() || null;

    upsertTransaction(session);

    console.log(
      `[sweep] SUCCESS ${session.session_id} → ${TREASURY_ADDRESS} | tx=${receipt.hash} | gas=${receipt.gasUsed}`
    );

    return session;
  } catch (err) {
    session.sweep_status = 'sweep_failed';
    session.sweep_last_error = err.message;
    upsertTransaction(session);

    console.error(`[sweep] FAILED ${session.session_id}:`, err.message);
    throw err;
  }
}

/**
 * Helper: extract the session index from the derivation path or fall back.
 * In initialize.js we store derivation_path, so we can parse it.
 */
function extractSessionIndex(session) {
  if (session.derivation_path) {
    const parts = session.derivation_path.split('/');
    return parseInt(parts[parts.length - 1], 10);
  }
  // Fallback: you can also store session_index explicitly in the future
  throw new Error('Cannot determine session index – derivation_path missing');
}

module.exports = { sweepSession };