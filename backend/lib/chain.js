
const { ethers } = require('ethers');

// Testnet USDC Contract Addresses
const CONFIG = {
  sepolia: {
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
  },
  amoy: {
    rpc: 'https://polygon-amoy.drpc.org',
    usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E587a5bf67d2960', // Standard Amoy USDC
  }
};

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

async function checkIncomingUsdc(network, walletAddress, blocksToScan = 100) {
  const networkMap = {
    'sepolia': 'sepolia',
    'sepolia testnet': 'sepolia',
    'amoy': 'amoy',
    'polygon amoy': 'amoy'
  };

  const netKey = networkMap[network?.toLowerCase()];
  const settings = CONFIG[netKey];

  if (!settings) {
    // console.error(`[chain] Unsupported network: "${network}"`);
    return { found: false };
  }
  const staticNetwork = netKey === 'sepolia' 
    ? { name: 'sepolia', chainId: 11155111 }
    : { name: 'amoy', chainId: 80002 };

  // Create provider with static network to avoid initial RPC handshake
  const provider = new ethers.JsonRpcProvider(settings.rpc, staticNetwork, {
    staticNetwork: true
  });
  const usdcContract = new ethers.Contract(settings.usdc, ERC20_ABI, provider);

  const latestBlock = await provider.getBlockNumber();
  const fromBlock = latestBlock - blocksToScan;

  // Filter logs where the 'to' address is your wallet
  const filter = usdcContract.filters.Transfer(null, walletAddress);
  
  try {
    const logs = await usdcContract.queryFilter(filter, fromBlock, latestBlock);
    
    if (logs.length > 0) {
      const latestTransfer = logs[logs.length - 1];
      return {
        found: true,
        tx_hash: latestTransfer.transactionHash,
        // USDC has 6 decimals, not 18 like ETH
        value: ethers.formatUnits(latestTransfer.args.value, 6), 
      };
    }
  } catch (err) {
    console.error(`[${network}] Scan failed:`, err.message);
  }

  return { found: false };
}

// Usage: checkIncomingUsdc('amoy', '0xYourWalletAddress')
module.exports = { checkIncomingUsdc };