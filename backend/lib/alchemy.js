/**
 * lib/alchemy.js
 *
 * Helper to dynamically add deposit addresses to Alchemy Address Activity webhooks.
 */

const ALCHEMY_AUTH_TOKEN = process.env.ALCHEMY_AUTH_TOKEN;

// Map your internal network keys → Alchemy webhook IDs
// Create one Address Activity webhook per network in the Alchemy dashboard
// and paste the webhook_id here (or in .env)
const WEBHOOK_IDS = {
  sepolia: process.env.ALCHEMY_WEBHOOK_ID_SEPOLIA,
  'base-sepolia': process.env.ALCHEMY_WEBHOOK_ID_BASE_SEPOLIA,
  'celo-sepolia': process.env.ALCHEMY_WEBHOOK_ID_CELO_SEPOLIA,
  amoy: process.env.ALCHEMY_WEBHOOK_ID_AMOY,
};

/**
 * Add a deposit address to the Address Activity webhook for a given network.
 * Safe to call even if the address is already registered (idempotent).
 */
async function addAddressToWebhook(network, address) {
  const webhookId = WEBHOOK_IDS[network];
  if (!webhookId) {
    console.warn(`[alchemy] No webhook_id configured for network: ${network}`);
    return;
  }
  if (!ALCHEMY_AUTH_TOKEN) {
    console.warn('[alchemy] ALCHEMY_AUTH_TOKEN not set – skipping address registration');
    return;
  }

  try {
    const res = await fetch('https://dashboard.alchemy.com/api/update-webhook-addresses', {
      method: 'PATCH',
      headers: {
        'X-Alchemy-Token': ALCHEMY_AUTH_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook_id: webhookId,
        addresses_to_add: [address],
        addresses_to_remove: [],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[alchemy] Failed to add address ${address} to ${network}:`, text);
      return;
    }

    console.log(`[alchemy] Added ${address} to ${network} webhook`);
  } catch (err) {
    console.error(`[alchemy] Error adding address to webhook:`, err.message);
  }
}

/**
 * Convenience: register the same deposit address on every network
 * the session supports.
 */
async function registerSessionAddress(session) {
  const networks = Object.keys(session.networks || {});
  await Promise.all(
    networks.map((net) => addAddressToWebhook(net, session.deposit_address))
  );
}

module.exports = {
  addAddressToWebhook,
  registerSessionAddress,
};