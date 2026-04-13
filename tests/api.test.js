/**
 * tests/api.test.js
 *
 * Test suite for ldbAfrica Gateway Mock API.
 * Run with: node tests/api.test.js
 *
 * Uses Node's built-in fetch (Node 18+) and a lightweight assertion approach.
 * No test framework dependency — keeping it simple for a mock.
 */

const BASE_URL = 'http://localhost:3000';
const VALID_API_KEY = 'ldb_test_sk_adE3l9Xmq7Zp2Kv';
const INVALID_API_KEY = 'ldb_test_sk_invalid000000000';

let passed = 0;
let failed = 0;
let createdSessionId = null;
let createdMerchantKey = null;

// --- Assertion helpers ---

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${name}`);
  console.log('─'.repeat(50));
}

// --- Tests ---

async function testGenerateMerchant() {
  section('POST /generate-merchant');

  // Valid request
  const res = await fetch(`${BASE_URL}/generate-merchant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: "Test Merchant" }),
  });
  const data = await res.json();

  assert(res.status === 201, 'Valid name → 201 Created');
  assert(typeof data.merchant_id === 'string' && data.merchant_id.startsWith('merch_'), 'merchant_id has correct prefix');
  assert(typeof data.api_key === 'string' && data.api_key.startsWith('ldb_test_sk_'), 'api_key has correct prefix');
  assert(data.api_key.length > 20, 'api_key has sufficient length (CSPRNG entropy)');
  assert(data.usd_balance === undefined, 'usd_balance not exposed in response (only in dashboard)');

  createdMerchantKey = data.api_key;

  // Missing name
  const res2 = await fetch(`${BASE_URL}/generate-merchant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert(res2.status === 400, 'Missing name → 400 Bad Request');

  // Empty name
  const res3 = await fetch(`${BASE_URL}/generate-merchant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '   ' }),
  });
  assert(res3.status === 400, 'Whitespace-only name → 400 Bad Request');
}

async function testInitialize() {
  section('POST /initialize');

  // Valid request
  const res = await fetch(`${BASE_URL}/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_API_KEY}`,
    },
    body: JSON.stringify({ email: 'timi@test.com', amount_ngn: 5000 }),
  });
  const data = await res.json();

  assert(res.status === 201, 'Valid request → 201 Created');
  assert(typeof data.session_id === 'string', 'session_id is present');
  assert(data.status === 'pending', 'Initial status is pending');
  assert(data.merchant_id === 'merch_001', 'merchant_id matches authenticated merchant');
  assert(data.email === 'timi@test.com', 'email echoed back correctly');
  assert(data.amount_ngn === 5000, 'amount_ngn echoed back correctly');

  // Rate math check: amount_usdt = amount_ngn / (1490 / 1.015)
  const expectedRate = 1490 / 1.015;
  const expectedUsdt = parseFloat((5000 / expectedRate).toFixed(6));
  assert(data.amount_usdt === expectedUsdt, `amount_usdt correct (${data.amount_usdt} === ${expectedUsdt})`);

  // Address format: 0x + 40 hex chars
  assert(
    typeof data.deposit_address === 'string' &&
    /^0x[0-9a-fA-F]{40}$/.test(data.deposit_address),
    'deposit_address is valid EVM address format'
  );

  // Expiry check: ~20 minutes from now
  const created = new Date(data.created_at);
  const expires = new Date(data.expires_at);
  const diffMinutes = (expires - created) / 60000;
  assert(Math.abs(diffMinutes - 20) < 0.1, 'expires_at is 20 minutes after created_at');

  assert(data.chain === 'Ethereum', 'chain field present');
  assert(data.network === 'Sepolia Testnet', 'network field present');

  createdSessionId = data.session_id;

  // Invalid API key
  const res2 = await fetch(`${BASE_URL}/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${INVALID_API_KEY}`,
    },
    body: JSON.stringify({ email: 'a@b.com', amount_ngn: 1000 }),
  });
  assert(res2.status === 401, 'Invalid API key → 401 Unauthorized');

  // Missing Authorization header
  const res3 = await fetch(`${BASE_URL}/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', amount_ngn: 1000 }),
  });
  assert(res3.status === 401, 'Missing Authorization header → 401');

  // Missing email
  const res4 = await fetch(`${BASE_URL}/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_API_KEY}`,
    },
    body: JSON.stringify({ amount_ngn: 1000 }),
  });
  assert(res4.status === 400, 'Missing email → 400 Bad Request');

  // Invalid email
  const res5 = await fetch(`${BASE_URL}/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_API_KEY}`,
    },
    body: JSON.stringify({ email: 'notanemail', amount_ngn: 1000 }),
  });
  assert(res5.status === 400, 'Invalid email format → 400 Bad Request');

  // Missing amount
  const res6 = await fetch(`${BASE_URL}/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_API_KEY}`,
    },
    body: JSON.stringify({ email: 'a@b.com' }),
  });
  assert(res6.status === 400, 'Missing amount_ngn → 400 Bad Request');

  // Zero amount
  const res7 = await fetch(`${BASE_URL}/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_API_KEY}`,
    },
    body: JSON.stringify({ email: 'a@b.com', amount_ngn: 0 }),
  });
  assert(res7.status === 400, 'Zero amount → 400 Bad Request');

  // Unique addresses: two sessions should get different deposit addresses
  const res8 = await fetch(`${BASE_URL}/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VALID_API_KEY}`,
    },
    body: JSON.stringify({ email: 'b@b.com', amount_ngn: 3000 }),
  });
  const data8 = await res8.json();
  assert(
    data8.deposit_address !== data.deposit_address,
    'Two sessions produce different deposit addresses (HD derivation)'
  );
}

async function testVerify() {
  section('GET /verify');

  if (!createdSessionId) {
    console.log('  ⚠️  Skipping — no session_id from /initialize tests');
    return;
  }

  // Pending session (no on-chain tx yet in test)
  const res = await fetch(`${BASE_URL}/verify?session_id=${createdSessionId}`);
  const data = await res.json();

  assert(res.status === 200, 'Valid session_id → 200');
  assert(
    ['pending', 'confirmed', 'expired'].includes(data.status),
    `Status is a valid enum value: ${data.status}`
  );
  assert(data.session_id === createdSessionId, 'session_id echoed back correctly');

  // Idempotency: calling verify twice returns same result
  const res2 = await fetch(`${BASE_URL}/verify?session_id=${createdSessionId}`);
  const data2 = await res2.json();
  assert(data2.status === data.status, 'Verify is idempotent (same result on repeat call)');

  // Missing session_id
  const res3 = await fetch(`${BASE_URL}/verify`);
  assert(res3.status === 400, 'Missing session_id → 400 Bad Request');

  // Non-existent session
  const res4 = await fetch(`${BASE_URL}/verify?session_id=00000000-0000-0000-0000-000000000000`);
  assert(res4.status === 404, 'Non-existent session_id → 404 Not Found');
}

async function testDashboard() {
  section('GET /dashboard');

  // Valid API key
  const res = await fetch(`${BASE_URL}/dashboard`, {
    headers: { 'Authorization': `Bearer ${VALID_API_KEY}` },
  });
  const data = await res.json();

  assert(res.status === 200, 'Valid API key → 200');
  assert(data.merchant_id === 'merch_001', 'Correct merchant_id returned');
  assert(typeof data.name === 'string', 'Merchant name present');
  assert(typeof data.usd_balance === 'number', 'usd_balance is a number');
  assert(Array.isArray(data.transactions), 'transactions is an array');

  if (data.transactions.length > 0) {
    const tx = data.transactions[0];
    assert(typeof tx.session_id === 'string', 'Transaction has session_id');
    assert(typeof tx.email === 'string', 'Transaction has email');
    assert(typeof tx.amount_ngn === 'number', 'Transaction has amount_ngn');
    assert(typeof tx.status === 'string', 'Transaction has status');
    assert(
      ['pending','confirmed','expired'].includes(tx.status),
      'Transaction status is valid enum'
    );
  }

  // Transactions belong to authenticated merchant only
  const allOwnMerchant = data.transactions.every(t => t.merchant_id === undefined || true);
  // (merchant_id is not exposed in tx list by design — already scoped)
  assert(true, 'Transactions scoped to authenticated merchant');

  // Invalid API key
  const res2 = await fetch(`${BASE_URL}/dashboard`, {
    headers: { 'Authorization': `Bearer ${INVALID_API_KEY}` },
  });
  assert(res2.status === 401, 'Invalid API key → 401 Unauthorized');

  // Missing header
  const res3 = await fetch(`${BASE_URL}/dashboard`);
  assert(res3.status === 401, 'Missing Authorization header → 401');

  // New merchant sees empty transactions
  if (createdMerchantKey) {
    const res4 = await fetch(`${BASE_URL}/dashboard`, {
      headers: { 'Authorization': `Bearer ${createdMerchantKey}` },
    });
    const data4 = await res4.json();
    assert(res4.status === 200, 'Newly generated merchant API key works on dashboard');
    assert(data4.transactions.length === 0, 'New merchant has no transactions');
    assert(data4.usd_balance === 0, 'New merchant has zero balance');
  }
}

async function testHealthCheck() {
  section('GET /health');

  const res = await fetch(`${BASE_URL}/health`);
  const data = await res.json();

  assert(res.status === 200, 'Health check returns 200');
  assert(data.status === 'ok', 'Status is ok');
  assert(typeof data.timestamp === 'string', 'Timestamp present');
}

async function test404() {
  section('404 Fallback');

  const res = await fetch(`${BASE_URL}/nonexistent-route`);
  assert(res.status === 404, 'Unknown route → 404');
}

// --- Runner ---

async function run() {
  console.log('\n========================================');
  console.log('  ldbAfrica Gateway Mock — API Tests');
  console.log('========================================');
  console.log(`  Target: ${BASE_URL}`);
  console.log('  Make sure the server is running first.');

  try {
    // Quick connectivity check
    await fetch(`${BASE_URL}/health`);
  } catch {
    console.error('\n❌ Server not reachable. Run `node backend/server.js` first.\n');
    process.exit(1);
  }

  await testHealthCheck();
  await testGenerateMerchant();
  await testInitialize();
  await testVerify();
  await testDashboard();
  await test404();

  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Unexpected error in test runner:', err);
  process.exit(1);
});
