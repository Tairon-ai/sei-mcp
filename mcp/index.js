const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const ethers = require("ethers");
const { parseUnits, formatUnits, formatEther, parseEther } = ethers.utils;
const axios = require("axios");
const crypto = require('crypto');
const DragonSwapV2 = require('./dragonswap');

// Define minimal ERC20 ABI
const ERC20ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function name() external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

// WSEI ABI for deposit and withdraw
const WSEI_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 wad) external",
  "function balanceOf(address account) external view returns (uint256)"
];

// DragonSwap V2 Router ABI (Concentrated Liquidity)
const DRAGONSWAP_V2_ROUTER_ABI = [
  // Exact input swaps
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  "function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)",

  // Exact output swaps
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)",
  "function exactOutput((bytes path, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum)) external payable returns (uint256 amountIn)"
];

// DragonSwap V2 Quoter ABI for price quotes
const DRAGONSWAP_V2_QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
  "function quoteExactOutputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut, uint160 sqrtPriceLimitX96) external returns (uint256 amountIn)"
];

// DragonSwap V2 Factory ABI
const DRAGONSWAP_V2_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
  "function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)"
];

// DragonSwap V2 Pool ABI
const DRAGONSWAP_V2_POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
  "function liquidity() external view returns (uint128)",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
];

// Load environment variables
require('dotenv').config();

// SEI Blockchain configuration
const SEI_CONFIG = {
  chainId: 1329, // SEI EVM Chain ID
  rpcUrl: process.env.SEI_RPC_URL || "https://evm-rpc.sei-apis.com",
  explorer: "https://seitrace.com",
  name: "SEI",
  nativeCurrency: {
    name: "SEI",
    symbol: "SEI",
    decimals: 18
  },
  // Common tokens on SEI - With dual address system (EVM and Cosmos)
  tokens: {
    // WSEI - Wrapped SEI
    wsei: {
      evm: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7",
      cosmos: "sei1zg7drpd7kfphfsz4kpwphmxrqywcz4ptmgk7d43e6amv24cpa7asfl4exa",
      symbol: "WSEI",
      decimals: 18,
      name: "Wrapped SEI"
    },
    // USDC - Native Circle USDC
    usdc: {
      evm: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
      cosmos: "", // No Cosmos address provided
      symbol: "USDC",
      decimals: 6, // USDC typically uses 6 decimals
      name: "USD Coin"
    },
    // USDT0 - Tether USD (bridged)
    usdt: {
      evm: "0x9151434b16b9763660705744891fA906F660EcC5",
      cosmos: "sei1fmsu3v448uny8hle52c3n8ygk3cgqz5a4j5283kx0q3ar3vs03mqa4v5ca",
      symbol: "USDT",
      decimals: 6, // USDT typically uses 6 decimals
      name: "USDT0" // Official name on SEI
    },
    // WETH - Bridged Wrapped Ether (Stargate)
    weth: {
      evm: "0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8",
      cosmos: "", // No Cosmos address provided
      symbol: "WETH",
      decimals: 18,
      name: "Bridged Wrapped Ether (Stargate)"
    },
    // SEIYAN - Native SEI token
    seiyan: {
      evm: "0x5f0E07dFeE5832Faa00c63F2D33A0D79150E8598",
      cosmos: "sei1hrndqntlvtmx2kepr0zsfgr7nzjptcc72cr4ppk4yav58vvy7v3s4er8ed",
      symbol: "SEIYAN",
      decimals: 6, // Need to verify
      name: "SEIYAN"
    },
    // JLY - Jelly Token
    jly: {
      evm: "0xDD7d5e4Ea2125d43C16eEd8f1FFeFffa2F4b4aF6",
      cosmos: "sei19jwyc77ccfmm5p0tq7vvxk9dwks8n88dl5fq6ymlnjp44547t53qvpyfmc",
      symbol: "JLY",
      decimals: 18, // Need to verify
      name: "Jelly Token"
    }
    // Testnet addresses (for reference):
    // usdc_testnet: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED"
  },
  // DEX contracts - DragonSwap V2 only (Concentrated Liquidity)
  dexes: {
    dragonswap: {
      // V2 Concentrated Liquidity - launched Nov 2024
      // Mainnet (pacific-1) addresses
      swapRouter: "0x11DA6463D6Cb5a03411Dbf5ab6f6bc3997Ac7428", // SwapRouter02
      factory: "0x179D9a5592Bc77050796F7be28058c51cA575df4", // DragonswapV2Factory
      positionManager: "0xa7FDcBe645d6b2B98639EbacbC347e2B575f6F70", // NonfungiblePositionManager
      quoter: "0x38F759cf0Af1D0dcAEd723a3967A3B658738eDe9", // QuoterV2
      // Additional contracts
      multicall: "0x2183BB693DFb41047f3812975b511e272883CfAA", // Multicall for batch calls
      tickLens: "0xD71AB34e3034Bb2A54243bb62Ab5986F6965aeB8", // TickLens for pool info
      v2Staker: "0x72c0cd98d21ee3263D375437b4FDAC097b596dD6", // V2 Staker for rewards
      // Oracle adapter for price feeds
      oracleAdapter: "", // SEI Native Oracle Adapter - still need this
      name: "DragonSwap V2",
      info: "Concentrated Liquidity DEX on SEI"
    },
    astroport: {
      router: "", // Astroport Router
      factory: "", // Astroport Factory
      name: "Astroport"
    }
    // Levana Protocol for perpetual swaps can be added here
  }
};

const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

// Initialize MCP server
const server = new McpServer({
  name: "SEI Blockchain MCP",
  version: "1.0.0",
  description: "An MCP server for SEI blockchain"
});

// Initialize DragonSwap V2
let dragonSwap = null;
const initDragonSwap = () => {
  if (!dragonSwap) {
    const provider = getProvider();
    dragonSwap = new DragonSwapV2(provider, SEI_CONFIG);
  }
  return dragonSwap;
};

// Helper to resolve token symbol to address
function resolveTokenAddress(tokenInput) {
  // If it's already an address (starts with 0x)
  if (tokenInput.startsWith('0x')) {
    return tokenInput;
  }
  
  // Look up by symbol
  const tokenKey = tokenInput.toLowerCase();
  if (SEI_CONFIG.tokens[tokenKey]) {
    return SEI_CONFIG.tokens[tokenKey].evm;
  }
  
  // Check by symbol in all tokens
  for (const [key, token] of Object.entries(SEI_CONFIG.tokens)) {
    if (token.symbol.toLowerCase() === tokenInput.toLowerCase()) {
      return token.evm;
    }
  }
  
  throw new Error(`Unknown token: ${tokenInput}`);
}

// Get provider with SEI network configuration
function getProvider() {
  return new ethers.providers.JsonRpcProvider(SEI_CONFIG.rpcUrl, {
    chainId: SEI_CONFIG.chainId,
    name: SEI_CONFIG.name
  });
}

// Get wallet instance
function getWallet() {
  if (!WALLET_PRIVATE_KEY) {
    throw new Error("WALLET_PRIVATE_KEY not configured");
  }
  const provider = getProvider();
  return new ethers.Wallet(WALLET_PRIVATE_KEY, provider);
}

// Tool: Get Service Info
server.tool(
  "getServiceInfo",
  "Get information about the SEI MCP service",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          name: "SEI Blockchain MCP",
          version: "1.0.0",
          chain: SEI_CONFIG.name,
          chainId: SEI_CONFIG.chainId,
          rpcUrl: SEI_CONFIG.rpcUrl,
          explorer: SEI_CONFIG.explorer,
          walletConfigured: !!WALLET_PRIVATE_KEY,
          supportedDEXs: Object.keys(SEI_CONFIG.dexes),
          capabilities: [
            "getWalletBalances",
            "getSupportedTokens", 
            "getTokenInfo",
            "getNativeBalance",
            "getBlockNumber",
            "getGasPrice",
            "estimateGas",
            "getTransactionStatus",
            "getAddressHistory",
            "convertAddress",
            "getTokenPrice",
            "sendNativeSEI",
            "sendToken",
            "getDragonSwapQuote",
            "getDragonSwapMultiHopQuote",
            "getDragonSwapPoolInfo",
            "getDragonSwapAllPools",
            "executeSwap"
          ]
        }, null, 2)
      }]
    };
  }
);

// Tool: Get wallet balances
server.tool(
  "getWalletBalances",
  "Get wallet balances for native SEI and tokens",
  {
    address: z.string().describe("Wallet address to check balances for").optional()
  },
  async ({ address }) => {
    try {
      const provider = getProvider();

      // Use provided address or get from configured wallet
      let walletAddress = address;
      if (!walletAddress && WALLET_PRIVATE_KEY) {
        const wallet = getWallet();
        walletAddress = wallet.address;
      }

      if (!walletAddress) {
        throw new Error("No wallet address provided and no wallet configured");
      }

      // Get native SEI balance
      const nativeBalance = await provider.getBalance(walletAddress);
      const formattedNativeBalance = formatUnits(nativeBalance, 18);

      const balances = {
        wallet: walletAddress,
        chain: SEI_CONFIG.name,
        nativeToken: {
          symbol: "SEI",
          balance: formattedNativeBalance,
          decimals: 18
        },
        tokens: []
      };

      // Check token balances for all configured tokens
      for (const [key, token] of Object.entries(SEI_CONFIG.tokens)) {
        if (token.evm) {
          try {
            const tokenContract = new ethers.Contract(token.evm, ERC20ABI, provider);
            const balance = await tokenContract.balanceOf(walletAddress);

            balances.tokens.push({
              symbol: token.symbol,
              name: token.name,
              evmAddress: token.evm,
              cosmosAddress: token.cosmos || null,
              balance: formatUnits(balance, token.decimals),
              decimals: token.decimals
            });
          } catch (error) {
            console.error(`Error fetching ${token.symbol} balance:`, error);
          }
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(balances, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting wallet balances: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get all supported tokens
server.tool(
  "getSupportedTokens",
  "Get list of all supported tokens with addresses",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tokens: SEI_CONFIG.tokens,
          nativeToken: SEI_CONFIG.nativeCurrency,
          chain: SEI_CONFIG.name
        }, null, 2)
      }]
    };
  }
);

// Tool: Get token information
server.tool(
  "getTokenInfo",
  "Get detailed information about a token on SEI",
  {
    tokenAddress: z.string().describe("Token contract address or symbol")
  },
  async ({ tokenAddress }) => {
    try {
      const provider = getProvider();

      // Check if it's a symbol and find the address
      let evmAddress = tokenAddress;
      let tokenInfo = null;

      // Check if input is a symbol
      for (const [key, token] of Object.entries(SEI_CONFIG.tokens)) {
        if (token.symbol.toLowerCase() === tokenAddress.toLowerCase() ||
            token.evm.toLowerCase() === tokenAddress.toLowerCase()) {
          evmAddress = token.evm;
          tokenInfo = token;
          break;
        }
      }

      if (!evmAddress || !evmAddress.startsWith('0x')) {
        throw new Error(`Token not found: ${tokenAddress}`);
      }

      const tokenContract = new ethers.Contract(evmAddress, ERC20ABI, provider);

      const [name, symbol, decimals, totalSupply] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.totalSupply()
      ]);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            evmAddress: evmAddress,
            cosmosAddress: tokenInfo?.cosmos || null,
            name,
            symbol,
            decimals,
            totalSupply: formatUnits(totalSupply, decimals),
            chain: SEI_CONFIG.name,
            configured: tokenInfo !== null
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting token info: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get native balance
server.tool(
  "getNativeBalance",
  "Get native SEI balance for an address",
  {
    address: z.string().describe("Address to check balance for")
  },
  async ({ address }) => {
    try {
      const provider = getProvider();
      const balance = await provider.getBalance(address);
      const formattedBalance = formatUnits(balance, 18);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            address,
            balance: formattedBalance,
            symbol: "SEI",
            chain: SEI_CONFIG.name
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting native balance: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get current block number
server.tool(
  "getBlockNumber",
  "Get the current block number on SEI",
  {},
  async () => {
    try {
      const provider = getProvider();
      const blockNumber = await provider.getBlockNumber();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            blockNumber,
            chain: SEI_CONFIG.name
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting block number: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get gas price
server.tool(
  "getGasPrice",
  "Get current gas price on SEI",
  {},
  async () => {
    try {
      const provider = getProvider();
      const gasPrice = await provider.getGasPrice();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            gasPrice: gasPrice.toString(),
            gasPriceGwei: formatUnits(gasPrice, "gwei"),
            chain: SEI_CONFIG.name
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting gas price: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Estimate gas for a transaction
server.tool(
  "estimateGas",
  "Estimate gas for a transaction on SEI",
  {
    to: z.string().describe("Recipient address"),
    value: z.string().describe("Amount of SEI to send (in SEI, not wei)").optional(),
    data: z.string().describe("Transaction data (for contract calls)").optional()
  },
  async ({ to, value, data }) => {
    try {
      const provider = getProvider();

      const transaction = {
        to,
        value: value ? parseUnits(value, 18) : undefined,
        data: data || "0x"
      };

      if (WALLET_PRIVATE_KEY) {
        const wallet = getWallet();
        transaction.from = wallet.address;
      }

      const gasEstimate = await provider.estimateGas(transaction);
      const gasPrice = await provider.getGasPrice();
      const estimatedCost = gasEstimate.mul(gasPrice);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            gasLimit: gasEstimate.toString(),
            gasPrice: gasPrice.toString(),
            gasPriceGwei: formatUnits(gasPrice, "gwei"),
            estimatedCost: formatUnits(estimatedCost, 18),
            estimatedCostSymbol: "SEI",
            chain: SEI_CONFIG.name
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error estimating gas: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Send native SEI
server.tool(
  "sendNativeSEI",
  "Send native SEI to another address",
  {
    to: z.string().describe("Recipient address"),
    amount: z.string().describe("Amount of SEI to send")
  },
  async ({ to, amount }) => {
    try {
      if (!WALLET_PRIVATE_KEY) {
        throw new Error("Wallet not configured");
      }

      const wallet = getWallet();
      const amountWei = parseUnits(amount, 18);

      const tx = await wallet.sendTransaction({
        to,
        value: amountWei
      });

      const receipt = await tx.wait();

      return {
        content: [{
          type: "text",
          text: JSON.stringify(formatTransactionResult(receipt, {
            from: wallet.address,
            to,
            amount,
            token: "SEI",
            action: "transfer"
          }), null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error sending SEI: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get DragonSwap quote
server.tool(
  "getDragonSwapQuote",
  "Get swap quote from DragonSwap V2 with automatic best pool selection",
  {
    tokenIn: z.string().describe("Input token symbol or address (e.g., 'USDC' or '0x...')"),
    tokenOut: z.string().describe("Output token symbol or address (e.g., 'SEI' or '0x...')"),
    amountIn: z.string().describe("Amount of input token"),
    slippage: z.number().describe("Slippage tolerance in percent").optional().default(0.5)
  },
  async ({ tokenIn, tokenOut, amountIn, slippage }) => {
    try {
      const ds = initDragonSwap();
      
      // Resolve token addresses from symbols if needed
      const tokenInAddress = resolveTokenAddress(tokenIn);
      const tokenOutAddress = resolveTokenAddress(tokenOut);

      // Get quote with best pool selection
      const quote = await ds.getQuote(tokenInAddress, tokenOutAddress, amountIn, slippage);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(quote, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting DragonSwap quote: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get multi-hop quote
server.tool(
  "getDragonSwapMultiHopQuote",
  "Get quote for multi-hop swap through multiple pools",
  {
    path: z.array(z.string()).describe("Array of token symbols or addresses in the swap path"),
    amountIn: z.string().describe("Amount of input token"),
    slippage: z.number().describe("Slippage tolerance in percent").optional().default(0.5)
  },
  async ({ path, amountIn, slippage }) => {
    try {
      const ds = initDragonSwap();
      
      // Resolve token addresses
      const resolvedPath = path.map(token => resolveTokenAddress(token));
      
      // Get multi-hop quote
      const quote = await ds.getMultiHopQuote(resolvedPath, amountIn, slippage);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(quote, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting multi-hop quote: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get pool information
server.tool(
  "getDragonSwapPoolInfo",
  "Get detailed information about DragonSwap V2 liquidity pools",
  {
    tokenA: z.string().describe("First token symbol or address"),
    tokenB: z.string().describe("Second token symbol or address"),
    fee: z.number().describe("Pool fee tier (100, 500, 3000, 10000)").optional()
  },
  async ({ tokenA, tokenB, fee }) => {
    try {
      const ds = initDragonSwap();
      
      // Resolve token addresses
      const tokenAAddress = resolveTokenAddress(tokenA);
      const tokenBAddress = resolveTokenAddress(tokenB);

      if (fee) {
        // Get specific pool
        const poolInfo = await ds.getPoolInfo(tokenAAddress, tokenBAddress, fee);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(poolInfo, null, 2)
          }]
        };
      } else {
        // Find all pools for this pair
        const pools = await ds.findBestPool(tokenAAddress, tokenBAddress);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ 
              pair: `${tokenA}/${tokenB}`,
              poolsFound: pools.length,
              pools 
            }, null, 2)
          }]
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting pool info: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get all active pools
server.tool(
  "getDragonSwapAllPools",
  "Get all active DragonSwap V2 pools for configured tokens",
  {},
  async () => {
    try {
      const ds = initDragonSwap();
      const pools = await ds.getAllPools();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            totalPools: pools.length,
            pools: pools.map(p => ({
              pair: `${p.token0.symbol}/${p.token1.symbol}`,
              fee: `${p.fee / 10000}%`,
              liquidity: p.liquidity,
              price: p.priceFormatted,
              address: p.address
            }))
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting all pools: ${error.message}`
        }]
      };
    }
  }
);

// Helper function to format transaction result
function formatTransactionResult(receipt, details = {}) {
  return {
    success: true,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    explorer: `${SEI_CONFIG.explorer}/tx/${receipt.transactionHash}`,
    ...details
  };
}

// Helper functions for address conversion (SEI Cosmos <-> EVM)
function evmToSei(evmAddress) {
  // Remove 0x prefix and convert to lowercase
  const cleanAddress = evmAddress.toLowerCase().replace('0x', '');
  
  // Convert hex to bytes
  const addressBytes = Buffer.from(cleanAddress, 'hex');
  
  // Bech32 encode with sei prefix
  // Note: This is a simplified version. In production, use proper bech32 library
  return `sei1${addressBytes.toString('hex').slice(0, 39)}`; // Simplified for demo
}

function seiToEvm(seiAddress) {
  // Check if it's a valid sei address
  if (!seiAddress.startsWith('sei1')) {
    throw new Error('Invalid SEI address format');
  }
  
  // Extract the hex part (simplified - in production use proper bech32 decode)
  const hexPart = seiAddress.slice(4); // Remove 'sei1' prefix
  
  // Pad with zeros if needed and add 0x prefix
  return '0x' + hexPart.padEnd(40, '0');
}

// Tool: Send ERC20 tokens
server.tool(
  "sendToken",
  "Send ERC20 tokens to another address using wallet private key",
  {
    token: z.string().describe("Token symbol or address (e.g., 'USDC' or '0x...')"),
    to: z.string().describe("Recipient address"),
    amount: z.string().describe("Amount of tokens to send")
  },
  async ({ token, to, amount }) => {
    try {
      if (!WALLET_PRIVATE_KEY) {
        throw new Error("Wallet not configured");
      }

      const wallet = getWallet();
      const tokenAddress = resolveTokenAddress(token);
      const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, wallet);
      
      // Get token info
      const [symbol, decimals, balance] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.balanceOf(wallet.address)
      ]);
      
      const amountWei = parseUnits(amount, decimals);
      
      // Check if user has enough balance
      if (balance.lt(amountWei)) {
        throw new Error(`Insufficient balance. Have ${formatUnits(balance, decimals)} ${symbol}, need ${amount}`);
      }
      
      // Send tokens (no approval needed for direct transfer)
      const tx = await tokenContract.transfer(to, amountWei);
      const receipt = await tx.wait();

      return {
        content: [{
          type: "text",
          text: JSON.stringify(formatTransactionResult(receipt, {
            from: wallet.address,
            to,
            token: symbol,
            amount,
            tokenAddress,
            action: "transfer"
          }), null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error sending tokens: ${error.message}`
        }]
      };
    }
  }
);




// Tool: Execute swap transaction (with automatic native SEI handling)
server.tool(
  "executeSwap",
  "Execute a swap on DragonSwap V2 (automatically handles native SEI wrapping)",
  {
    tokenIn: z.string().describe("Input token ('SEI' for native, 'USDC', 'WSEI', etc)").optional(),
    tokenOut: z.string().describe("Output token symbol or address").optional(),
    path: z.array(z.string()).describe("Multi-hop swap path (overrides tokenIn/tokenOut)").optional(),
    amountIn: z.string().describe("Amount of input token"),
    amountOutMin: z.string().describe("Minimum output amount").optional(),
    slippage: z.number().describe("Slippage % (auto-adjusts: 1%, 2% if fails)").optional(),
    recipient: z.string().describe("Recipient address").optional(),
    deadline: z.number().describe("Transaction deadline").optional()
  },
  async ({ tokenIn, tokenOut, path, amountIn, amountOutMin, slippage, recipient, deadline }) => {
    try {
      if (!WALLET_PRIVATE_KEY) {
        throw new Error("Wallet not configured for executing swaps");
      }

      const wallet = getWallet();
      const provider = getProvider();
      const ds = initDragonSwap();
      const { parseEther } = ethers.utils;
      
      let actualTokenIn = tokenIn;
      let wrapTxHash = null;
      let transactions = [];
      
      // Handle native SEI input - automatically wrap to WSEI
      // Check BEFORE resolving token address
      if (tokenIn && (tokenIn.toLowerCase() === 'sei' || tokenIn.toLowerCase() === 'native')) {
        
        // Parse amount and check balance
        const amountWei = parseEther(amountIn);
        const balance = await provider.getBalance(wallet.address);
        
        // Reserve some SEI for gas
        const gasReserve = parseEther("0.1"); // Keep 0.1 SEI for gas
        const totalNeeded = amountWei.add(gasReserve);
        
        if (balance.lt(totalNeeded)) {
          throw new Error(`Insufficient SEI balance. Have ${formatEther(balance)} SEI, need ${formatEther(totalNeeded)} SEI (including gas)`);
        }
        
        // Wrap SEI to WSEI
        const wseiContract = new ethers.Contract(
          SEI_CONFIG.tokens.wsei.evm,
          WSEI_ABI,
          wallet
        );
        
        console.log(`Wrapping ${amountIn} SEI to WSEI...`);
        const wrapTx = await wseiContract.deposit({ 
          value: amountWei,
          gasLimit: 100000
        });
        const wrapReceipt = await wrapTx.wait();
        wrapTxHash = wrapReceipt.transactionHash;
        console.log(`SEI wrapped to WSEI: ${wrapTxHash}`);
        transactions.push({type: "wrap", hash: wrapTxHash});
        
        // Update tokenIn to WSEI for the actual swap
        actualTokenIn = 'WSEI';
      }
      
      // Auto-adjust slippage if needed (try 1%, then 2%)
      const slippageOptions = slippage ? [slippage] : [1, 2];
      let lastError = null;
      let swapReceipt = null;
      let usedSlippage = null;
      
      for (const currentSlippage of slippageOptions) {
        try {
          let swapTx;
          let minOut = amountOutMin;
          let inputToken, outputToken;
          
          // Handle multi-hop or single swap
          if (path && path.length > 1) {
            // Replace 'SEI' with 'WSEI' in path if needed
            const actualPath = path.map(token => 
              token.toLowerCase() === 'sei' ? 'WSEI' : token
            );
            const resolvedPath = actualPath.map(token => resolveTokenAddress(token));
            inputToken = actualPath[0];
            outputToken = actualPath[actualPath.length - 1];
            
            if (!minOut) {
              const quote = await ds.getMultiHopQuote(resolvedPath, amountIn, currentSlippage);
              minOut = quote.amountOutMin;
            }
            
            swapTx = await ds.prepareMultiHopSwap(
              resolvedPath,
              amountIn,
              minOut,
              recipient || wallet.address,
              deadline
            );
          } else {
            if (!actualTokenIn || !tokenOut) {
              throw new Error("Either provide tokenIn/tokenOut or a path array");
            }
            
            inputToken = actualTokenIn;
            outputToken = tokenOut;
            const tokenInAddress = resolveTokenAddress(actualTokenIn);
            const tokenOutAddress = resolveTokenAddress(tokenOut);
            
            // Special case: SEI to WSEI should not go through swap, already handled by wrapping above
            if (actualTokenIn === 'WSEI' && tokenOut.toLowerCase() === 'wsei') {
              // Already wrapped, just return success
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    message: "Native SEI successfully wrapped to WSEI",
                    wrapTransaction: wrapTxHash,
                    transactions: transactions
                  }, null, 2)
                }]
              };
            }
            
            // Check if direct pool exists
            const directPools = await ds.findBestPool(tokenInAddress, tokenOutAddress);
            
            if (directPools && directPools.length > 0) {
              // Direct pool exists
              if (!minOut) {
                const quote = await ds.getQuote(tokenInAddress, tokenOutAddress, amountIn, currentSlippage);
                minOut = quote.amountOutMin;
              }
              
              swapTx = await ds.prepareSwap(
                tokenInAddress,
                tokenOutAddress,
                amountIn,
                minOut,
                recipient || wallet.address,
                deadline
              );
            } else {
              // No direct pool, try multi-hop through WSEI
              const wseiAddress = SEI_CONFIG.tokens.wsei.evm;
              let hopPath;
              
              if (tokenInAddress === wseiAddress) {
                // WSEI to token - try through USDT
                hopPath = [tokenInAddress, SEI_CONFIG.tokens.usdt.evm, tokenOutAddress];
              } else if (tokenOutAddress === wseiAddress) {
                // Token to WSEI - try through USDT
                hopPath = [tokenInAddress, SEI_CONFIG.tokens.usdt.evm, tokenOutAddress];
              } else {
                // Neither is WSEI, route through WSEI
                hopPath = [tokenInAddress, wseiAddress, tokenOutAddress];
              }
              
              if (!minOut) {
                const quote = await ds.getMultiHopQuote(hopPath, amountIn, currentSlippage);
                minOut = quote.amountOutMin;
              }
              
              swapTx = await ds.prepareMultiHopSwap(
                hopPath,
                amountIn,
                minOut,
                recipient || wallet.address,
                deadline
              );
            }
          }
          
          // Check and approve tokens
          const tokenInAddress = resolveTokenAddress(inputToken);
          if (tokenInAddress) {
            const tokenContract = new ethers.Contract(tokenInAddress, ERC20ABI, wallet);
            const allowance = await tokenContract.allowance(wallet.address, swapTx.to);
            const amountInWei = parseUnits(amountIn, await tokenContract.decimals());
            
            if (allowance.lt(amountInWei)) {
              const approveTx = await tokenContract.approve(swapTx.to, ethers.constants.MaxUint256);
              const approveReceipt = await approveTx.wait();
              transactions.push({type: "approval", hash: approveReceipt.transactionHash});
            }
          }
          
          // Execute the swap
          const tx = await wallet.sendTransaction({
            to: swapTx.to,
            data: swapTx.data,
            value: swapTx.value || 0,
            gasLimit: swapTx.gasLimit
          });
          
          swapReceipt = await tx.wait();
          
          if (swapReceipt.status === 0) {
            throw new Error(`Transaction failed with ${currentSlippage}% slippage`);
          }
          
          usedSlippage = currentSlippage;
          console.log(`Swap successful with ${currentSlippage}% slippage!`);
          transactions.push({type: "swap", hash: swapReceipt.transactionHash});
          
          // Success - format result
          return {
            content: [{
              type: "text",
              text: JSON.stringify(formatTransactionResult(swapReceipt, {
                from: wallet.address,
                to: recipient || wallet.address,
                tokenIn: tokenIn || inputToken, // Show original input
                tokenOut: outputToken,
                path: path || [tokenIn || inputToken, outputToken],
                amountIn: amountIn,
                amountOutMin: minOut,
                type: wrapTxHash ? "native-swap" : (path && path.length > 2 ? "multi-hop" : "direct"),
                slippageUsed: `${usedSlippage}%`,
                transactions: transactions,
                pool: swapTx.pool,
                dex: "DragonSwap V2"
              }), null, 2)
            }]
          };
          
        } catch (error) {
          lastError = error;
          console.log(`Failed with ${currentSlippage}% slippage: ${error.message}`);
          
          // If it's not a slippage issue, don't retry
          if (!error.message.includes('failed') && 
              !error.message.includes('slippage') && 
              !error.message.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {
            throw error;
          }
        }
      }
      
      // All attempts failed
      throw lastError || new Error("Swap failed with all slippage attempts");
      
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error executing swap: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get transaction status
server.tool(
  "getTransactionStatus",
  "Get the status and details of a transaction by hash",
  {
    txHash: z.string().describe("Transaction hash to check")
  },
  async ({ txHash }) => {
    try {
      const provider = getProvider();
      
      // Get transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        // Try to get pending transaction
        const tx = await provider.getTransaction(txHash);
        if (tx) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                status: "pending",
                hash: txHash,
                from: tx.from,
                to: tx.to,
                value: formatEther(tx.value || 0),
                gasPrice: formatUnits(tx.gasPrice || 0, "gwei"),
                nonce: tx.nonce
              }, null, 2)
            }]
          };
        } else {
          throw new Error("Transaction not found");
        }
      }
      
      // Get transaction details
      const tx = await provider.getTransaction(txHash);
      const block = await provider.getBlock(receipt.blockNumber);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: receipt.status === 1 ? "success" : "failed",
            hash: txHash,
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            timestamp: block.timestamp,
            from: receipt.from,
            to: receipt.to,
            contractAddress: receipt.contractAddress,
            gasUsed: receipt.gasUsed.toString(),
            effectiveGasPrice: formatUnits(receipt.effectiveGasPrice || 0, "gwei"),
            cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
            confirmations: receipt.confirmations,
            explorer: `${SEI_CONFIG.explorer}/tx/${txHash}`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting transaction status: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Convert address between formats
server.tool(
  "convertAddress",
  "Convert address between SEI Cosmos (sei1...) and EVM (0x...) formats",
  {
    address: z.string().describe("Address to convert (sei1... or 0x...)")
  },
  async ({ address }) => {
    try {
      let evmAddress, seiAddress;
      
      if (address.startsWith('0x') || address.startsWith('0X')) {
        // EVM to SEI conversion
        evmAddress = address.toLowerCase();
        
        // For mainnet, use the actual associated address if available
        // This is simplified - in production, query the blockchain for actual association
        seiAddress = evmToSei(evmAddress);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              input: address,
              inputFormat: "EVM",
              evmAddress,
              seiAddress,
              note: "This is a derived address. For actual cross-chain associations, check on-chain pointer contracts.",
              explorer: `${SEI_CONFIG.explorer}/address/${evmAddress}`
            }, null, 2)
          }]
        };
      } else if (address.startsWith('sei1')) {
        // SEI to EVM conversion
        seiAddress = address;
        evmAddress = seiToEvm(seiAddress);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              input: address,
              inputFormat: "Cosmos",
              seiAddress,
              evmAddress,
              note: "This is a derived address. For actual cross-chain associations, check on-chain pointer contracts.",
              explorer: `${SEI_CONFIG.explorer}/address/${evmAddress}`
            }, null, 2)
          }]
        };
      } else {
        throw new Error("Invalid address format. Must start with '0x' or 'sei1'");
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error converting address: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get token price
server.tool(
  "getTokenPrice",
  "Get the current price of a token from DragonSwap pools",
  {
    token: z.string().describe("Token symbol or address (e.g., 'USDC' or '0x...')"),
    baseToken: z.string().describe("Base token for pricing (default: USDC)").optional().default("USDC")
  },
  async ({ token, baseToken }) => {
    try {
      const ds = initDragonSwap();
      const tokenAddress = resolveTokenAddress(token);
      const baseTokenAddress = resolveTokenAddress(baseToken);
      
      // Get token info
      const provider = getProvider();
      const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, provider);
      const [symbol, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals()
      ]);
      
      // Try to get price from pool
      try {
        // Get quote for 1 token
        const amountIn = "1";
        const quote = await ds.getQuote(tokenAddress, baseTokenAddress, amountIn, 0.5);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              token: symbol,
              tokenAddress,
              baseToken,
              price: quote.amountOut,
              priceImpact: quote.priceImpact,
              pool: quote.bestPool,
              liquidity: quote.liquidity,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      } catch (poolError) {
        // No direct pool found, try multi-hop through WSEI
        const wseiAddress = SEI_CONFIG.tokens.wsei.evm;
        
        if (tokenAddress === wseiAddress || baseTokenAddress === wseiAddress) {
          throw poolError; // Can't route through WSEI if it's already involved
        }
        
        const quote = await ds.getMultiHopQuote(
          [tokenAddress, wseiAddress, baseTokenAddress],
          "1",
          0.5
        );
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              token: symbol,
              tokenAddress,
              baseToken,
              price: quote.amountOut,
              priceImpact: quote.priceImpact,
              route: "multi-hop via WSEI",
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting token price: ${error.message}`
        }]
      };
    }
  }
);

// Tool: Get address transaction history
server.tool(
  "getAddressHistory",
  "Get recent transaction history for an address",
  {
    address: z.string().describe("Address to check history for"),
    limit: z.number().describe("Number of recent transactions to return").optional().default(10)
  },
  async ({ address, limit }) => {
    try {
      const provider = getProvider();
      
      // Get current block
      const currentBlock = await provider.getBlockNumber();
      
      // This is a simplified version - in production, use an indexer API
      // For now, we'll check recent blocks for transactions
      const transactions = [];
      const blocksToCheck = Math.min(limit * 2, 100); // Check up to 100 recent blocks
      
      for (let i = 0; i < blocksToCheck && transactions.length < limit; i++) {
        try {
          const block = await provider.getBlockWithTransactions(currentBlock - i);
          
          for (const tx of block.transactions) {
            if (tx.from?.toLowerCase() === address.toLowerCase() || 
                tx.to?.toLowerCase() === address.toLowerCase()) {
              
              const receipt = await provider.getTransactionReceipt(tx.hash);
              
              transactions.push({
                hash: tx.hash,
                blockNumber: tx.blockNumber,
                timestamp: block.timestamp,
                from: tx.from,
                to: tx.to,
                value: formatEther(tx.value || 0),
                gasUsed: receipt.gasUsed.toString(),
                status: receipt.status === 1 ? "success" : "failed",
                type: tx.from?.toLowerCase() === address.toLowerCase() ? "sent" : "received"
              });
              
              if (transactions.length >= limit) break;
            }
          }
        } catch (blockError) {
          // Skip blocks that can't be fetched
          continue;
        }
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            address,
            transactionCount: transactions.length,
            transactions,
            note: "Shows recent transactions from last " + blocksToCheck + " blocks",
            explorer: `${SEI_CONFIG.explorer}/address/${address}`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error getting address history: ${error.message}`
        }]
      };
    }
  }
);

// Initialize and run the server
async function main() {
  console.log("🚀 Starting SEI Blockchain MCP Server...");
  console.log(`⛓️ Chain: ${SEI_CONFIG.name} (ID: ${SEI_CONFIG.chainId})`);
  console.log(`🌐 RPC: ${SEI_CONFIG.rpcUrl}`);
  console.log(`🔑 Wallet configured: ${!!WALLET_PRIVATE_KEY}`);

  if (WALLET_PRIVATE_KEY) {
    try {
      const wallet = getWallet();
      console.log(`📝 Wallet address: ${wallet.address}`);
    } catch (error) {
      console.error("⚠️ Error initializing wallet:", error.message);
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("✅ SEI MCP Server is running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
