/**
 * lib/chain.js
 *
 * Multi-chain config + USDC helpers.
 * Supports: sepolia, base-sepolia, celo-sepolia, amoy
 */

const { ethers } = require('ethers');

const CONFIG = {
  sepolia: {
    name: 'sepolia',
    chainId: 11155111,
    rpc: process.env.ALCHEMY_SEPOLIA_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    nativeSymbol: 'ETH',
  },
  'base-sepolia': {
    name: 'base-sepolia',
    chainId: 84532,
    rpc: process.env.ALCHEMY_BASE_SEPOLIA_URL || 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    nativeSymbol: 'ETH',
  },
  'celo-sepolia': {
    name: 'celo-sepolia',
    chainId: 11142220,
    rpc: process.env.ALCHEMY_CELO_SEPOLIA_URL || 'https://forno.celo-sepolia.celo-testnet.org',
    usdc: '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
    nativeSymbol: 'CELO',
  },
  amoy: {
    name: 'amoy',
    chainId: 80002,
    rpc: process.env.ALCHEMY_AMOY_URL || 'https://polygon-amoy.drpc.org',
    usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Circle USDC on Amoy
    nativeSymbol: 'POL',
  },
};

// Normalize common aliases coming from the frontend / old code
const NETWORK_ALIASES = {
  sepolia: 'sepolia',
  'sepolia testnet': 'sepolia',
  'base-sepolia': 'base-sepolia',
  'base sepolia': 'base-sepolia',
  base: 'base-sepolia',
  'celo-sepolia': 'celo-sepolia',
  'celo sepolia': 'celo-sepolia',
  celo: 'celo-sepolia',
  alfajores: 'celo-sepolia',
  amoy: 'amoy',
  'polygon amoy': 'amoy',
  polygon: 'amoy',
};

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

function getNetworkConfig(network) {
  const key = NETWORK_ALIASES[network?.toLowerCase()];
  if (!key || !CONFIG[key]) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return CONFIG[key];
}

function getProvider(network) {
  const cfg = getNetworkConfig(network);
  return new ethers.JsonRpcProvider(
    cfg.rpc,
    { name: cfg.name, chainId: cfg.chainId },
    { staticNetwork: true }
  );
}

function getUsdcContract(network, signerOrProvider) {
  const cfg = getNetworkConfig(network);
  return new ethers.Contract(cfg.usdc, ERC20_ABI, signerOrProvider);
}

/**
 * Check for incoming USDC Transfer events to the deposit address.
 * Used by the existing /verify polling path.
 */
async function checkIncomingUsdc(network, walletAddress, blocksToScan = 10) {
  try {
    const cfg = getNetworkConfig(network);
    const provider = getProvider(network);
    const usdc = getUsdcContract(network, provider);

    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - blocksToScan);

    const filter = usdc.filters.Transfer(null, walletAddress);
    const logs = await usdc.queryFilter(filter, fromBlock, latestBlock);

    if (logs.length > 0) {
      const latest = logs[logs.length - 1];
      return {
        found: true,
        tx_hash: latest.transactionHash,
        value: ethers.formatUnits(latest.args.value, 6),
      };
    }
  } catch (err) {
    console.error(`[chain] checkIncomingUsdc failed (${network}):`, err.message);
  }
  return { found: false };
}

module.exports = {
  CONFIG,
  getNetworkConfig,
  getProvider,
  getUsdcContract,
  checkIncomingUsdc,
  ERC20_ABI,
};