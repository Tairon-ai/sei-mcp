/**
 * DragonSwap V2 Integration Module
 * Full implementation for concentrated liquidity DEX on SEI
 */

const { ethers } = require('ethers');

// DragonSwap V2 ABIs
const QUOTER_V2_ABI = [
  'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactOutputSingle(tuple(address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
  'function feeAmountTickSpacing(uint24 fee) external view returns (int24)',
  'function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)'
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function tickSpacing() external view returns (int24)',
  'function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)'
];

const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)'
];

const ROUTER_ABI = [
  // Exact input swaps
  'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)',
  'function exactInput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)',
  
  // Exact output swaps
  'function exactOutputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountIn)',
  'function exactOutput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum) params) external payable returns (uint256 amountIn)',
  
  // Helper functions
  'function unwrapWETH9(uint256 amountMinimum, address recipient) external payable',
  'function refundETH() external payable',
  'function sweepToken(address token, uint256 amountMinimum, address recipient) external payable',
  'function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)'
];

class DragonSwapV2 {
  constructor(provider, config) {
    this.provider = provider;
    this.config = config;
    
    // Initialize contracts
    this.quoter = new ethers.Contract(config.dexes.dragonswap.quoter, QUOTER_V2_ABI, provider);
    this.factory = new ethers.Contract(config.dexes.dragonswap.factory, FACTORY_ABI, provider);
    this.router = new ethers.Contract(config.dexes.dragonswap.swapRouter, ROUTER_ABI, provider);
    
    // Fee tiers in DragonSwap V2 (in basis points)
    this.FEE_TIERS = {
      LOWEST: 100,    // 0.01%
      LOW: 500,       // 0.05%
      MEDIUM: 3000,   // 0.30%
      HIGH: 10000     // 1.00%
    };
    
    // Token cache for decimals
    this.tokenCache = new Map();
  }

  /**
   * Get token info including decimals
   */
  async getTokenInfo(tokenAddress) {
    if (this.tokenCache.has(tokenAddress)) {
      return this.tokenCache.get(tokenAddress);
    }

    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      const [decimals, symbol, name] = await Promise.all([
        token.decimals(),
        token.symbol().catch(() => 'UNKNOWN'),
        token.name().catch(() => 'Unknown Token')
      ]);

      const info = { address: tokenAddress, decimals, symbol, name };
      this.tokenCache.set(tokenAddress, info);
      return info;
    } catch (error) {
      console.error(`Failed to get token info for ${tokenAddress}:`, error);
      // Default to 18 decimals if we can't fetch
      const info = { address: tokenAddress, decimals: 18, symbol: 'UNKNOWN', name: 'Unknown' };
      this.tokenCache.set(tokenAddress, info);
      return info;
    }
  }

  /**
   * Find the best pool for a token pair
   */
  async findBestPool(tokenA, tokenB) {
    const pools = [];
    
    // Check all fee tiers for both token orders
    for (const [tierName, fee] of Object.entries(this.FEE_TIERS)) {
      try {
        // Try both token orders
        let poolAddress = await this.factory.getPool(tokenA, tokenB, fee);
        
        // If no pool found, try reversed order
        if (!poolAddress || poolAddress === ethers.constants.AddressZero) {
          poolAddress = await this.factory.getPool(tokenB, tokenA, fee);
        }
        
        if (poolAddress && poolAddress !== ethers.constants.AddressZero) {
          const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
          const [slot0, liquidity] = await Promise.all([
            pool.slot0(),
            pool.liquidity()
          ]);

          pools.push({
            address: poolAddress,
            fee,
            tierName,
            sqrtPriceX96: slot0.sqrtPriceX96.toString(),
            tick: slot0.tick,
            liquidity: liquidity.toString(),
            active: liquidity.gt(0)
          });
        }
      } catch (error) {
        // Pool doesn't exist for this fee tier
        continue;
      }
    }

    // Sort by liquidity (highest first)
    pools.sort((a, b) => {
      const liqA = ethers.BigNumber.from(a.liquidity);
      const liqB = ethers.BigNumber.from(b.liquidity);
      return liqB.gt(liqA) ? 1 : -1;
    });

    return pools;
  }

  /**
   * Get quote for exact input swap
   */
  async getQuote(tokenIn, tokenOut, amountIn, slippagePercent = 0.5) {
    try {
      // Get token info
      const [tokenInInfo, tokenOutInfo] = await Promise.all([
        this.getTokenInfo(tokenIn),
        this.getTokenInfo(tokenOut)
      ]);

      // Convert amount to proper decimals
      const amountInWei = ethers.utils.parseUnits(amountIn.toString(), tokenInInfo.decimals);

      // Find best pool
      const pools = await this.findBestPool(tokenIn, tokenOut);
      if (pools.length === 0) {
        throw new Error(`No liquidity pool found for ${tokenInInfo.symbol}/${tokenOutInfo.symbol}`);
      }

      // Try to get quote from the pool with highest liquidity
      let bestQuote = null;
      let bestPool = null;

      for (const pool of pools) {
        if (!pool.active) continue;

        try {
          const quoteParams = {
            tokenIn,
            tokenOut,
            amountIn: amountInWei,
            fee: pool.fee,
            sqrtPriceLimitX96: 0 // No price limit
          };

          const result = await this.quoter.callStatic.quoteExactInputSingle(quoteParams);
          const amountOut = result.amountOut;

          if (!bestQuote || amountOut.gt(bestQuote.amountOut)) {
            bestQuote = {
              amountOut,
              sqrtPriceX96After: result.sqrtPriceX96After,
              gasEstimate: result.gasEstimate
            };
            bestPool = pool;
          }
        } catch (error) {
          console.log(`Quote failed for pool ${pool.tierName}:`, error.message);
          continue;
        }
      }

      if (!bestQuote) {
        throw new Error('Failed to get quote from any pool');
      }

      // Calculate amounts with slippage
      const amountOutFormatted = ethers.utils.formatUnits(bestQuote.amountOut, tokenOutInfo.decimals);
      const slippageMultiplier = 1 - (slippagePercent / 100);
      const amountOutMin = bestQuote.amountOut.mul(Math.floor(slippageMultiplier * 10000)).div(10000);
      const amountOutMinFormatted = ethers.utils.formatUnits(amountOutMin, tokenOutInfo.decimals);

      // Calculate price impact
      const priceImpact = this.calculatePriceImpact(
        bestPool.sqrtPriceX96,
        bestQuote.sqrtPriceX96After.toString()
      );

      return {
        amountIn: amountIn.toString(),
        amountOut: amountOutFormatted,
        amountOutMin: amountOutMinFormatted,
        tokenIn: tokenInInfo,
        tokenOut: tokenOutInfo,
        pool: {
          address: bestPool.address,
          fee: bestPool.fee,
          tierName: bestPool.tierName,
          liquidity: bestPool.liquidity
        },
        priceImpact: priceImpact.toFixed(2),
        gasEstimate: bestQuote.gasEstimate.toString(),
        slippage: slippagePercent,
        route: `${tokenInInfo.symbol} → ${tokenOutInfo.symbol}`,
        executionPrice: (parseFloat(amountOutFormatted) / parseFloat(amountIn)).toFixed(6)
      };
    } catch (error) {
      throw new Error(`Quote failed: ${error.message}`);
    }
  }

  /**
   * Get quote for multi-hop swap
   */
  async getMultiHopQuote(path, amountIn, slippagePercent = 0.5) {
    if (path.length < 2) {
      throw new Error('Path must have at least 2 tokens');
    }

    const quotes = [];
    let currentAmountIn = amountIn;

    // Get quotes for each hop
    for (let i = 0; i < path.length - 1; i++) {
      const quote = await this.getQuote(
        path[i],
        path[i + 1],
        currentAmountIn,
        0 // No slippage for intermediate quotes
      );
      quotes.push(quote);
      currentAmountIn = quote.amountOut;
    }

    // Apply slippage to final amount
    const finalAmountOut = parseFloat(currentAmountIn);
    const finalAmountOutMin = finalAmountOut * (1 - slippagePercent / 100);

    // Build route string
    const route = quotes.map(q => q.tokenIn.symbol).join(' → ') + ' → ' + quotes[quotes.length - 1].tokenOut.symbol;

    // Calculate total price impact
    const totalPriceImpact = quotes.reduce((sum, q) => sum + parseFloat(q.priceImpact), 0);

    return {
      amountIn: amountIn.toString(),
      amountOut: finalAmountOut.toFixed(6),
      amountOutMin: finalAmountOutMin.toFixed(6),
      quotes,
      route,
      hops: path.length - 1,
      totalPriceImpact: totalPriceImpact.toFixed(2),
      slippage: slippagePercent
    };
  }

  /**
   * Prepare swap transaction
   */
  async prepareSwap(tokenIn, tokenOut, amountIn, amountOutMin, recipient, deadline = null) {
    try {
      // Get token info
      const [tokenInInfo, tokenOutInfo] = await Promise.all([
        this.getTokenInfo(tokenIn),
        this.getTokenInfo(tokenOut)
      ]);

      // Find best pool
      const pools = await this.findBestPool(tokenIn, tokenOut);
      if (pools.length === 0) {
        throw new Error(`No liquidity pool found for ${tokenInInfo.symbol}/${tokenOutInfo.symbol}`);
      }

      const bestPool = pools[0]; // Use pool with highest liquidity

      // Convert amounts
      const amountInWei = ethers.utils.parseUnits(amountIn.toString(), tokenInInfo.decimals);
      const amountOutMinWei = ethers.utils.parseUnits(amountOutMin.toString(), tokenOutInfo.decimals);

      // Set deadline (20 minutes from now if not provided)
      if (!deadline) {
        deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      }

      // Prepare swap parameters
      const swapParams = {
        tokenIn,
        tokenOut,
        fee: bestPool.fee,
        recipient: recipient || ethers.constants.AddressZero,
        deadline,
        amountIn: amountInWei,
        amountOutMinimum: amountOutMinWei,
        sqrtPriceLimitX96: 0
      };

      // Encode swap data
      const swapData = this.router.interface.encodeFunctionData('exactInputSingle', [swapParams]);

      // WSEI is an ERC20 token, not native SEI, so we never send value with swap
      // Value would only be sent if we were wrapping native SEI to WSEI first
      const value = ethers.BigNumber.from(0);

      return {
        to: this.config.dexes.dragonswap.swapRouter,
        data: swapData,
        value: value.toString(),
        gasLimit: '300000', // Estimated gas
        pool: {
          address: bestPool.address,
          fee: bestPool.fee,
          tierName: bestPool.tierName
        },
        params: {
          tokenIn: tokenInInfo,
          tokenOut: tokenOutInfo,
          amountIn: amountIn.toString(),
          amountOutMin: amountOutMin.toString(),
          deadline,
          recipient
        }
      };
    } catch (error) {
      throw new Error(`Failed to prepare swap: ${error.message}`);
    }
  }

  /**
   * Prepare multi-hop swap transaction
   */
  async prepareMultiHopSwap(path, amountIn, amountOutMin, recipient, deadline = null) {
    if (path.length < 2) {
      throw new Error('Path must have at least 2 tokens');
    }

    // Get token info for all tokens in path
    const tokenInfos = await Promise.all(path.map(addr => this.getTokenInfo(addr)));

    // Build path with fees
    const pathWithFees = [];
    for (let i = 0; i < path.length - 1; i++) {
      const pools = await this.findBestPool(path[i], path[i + 1]);
      if (pools.length === 0) {
        throw new Error(`No pool found for ${tokenInfos[i].symbol} → ${tokenInfos[i + 1].symbol}`);
      }
      
      pathWithFees.push(path[i]);
      pathWithFees.push(pools[0].fee);
    }
    pathWithFees.push(path[path.length - 1]);

    // Encode path
    const encodedPath = this.encodePath(pathWithFees);

    // Convert amounts
    const amountInWei = ethers.utils.parseUnits(amountIn.toString(), tokenInfos[0].decimals);
    const amountOutMinWei = ethers.utils.parseUnits(amountOutMin.toString(), tokenInfos[tokenInfos.length - 1].decimals);

    // Set deadline
    if (!deadline) {
      deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    }

    // Prepare swap parameters
    const swapParams = {
      path: encodedPath,
      recipient: recipient || ethers.constants.AddressZero,
      deadline,
      amountIn: amountInWei,
      amountOutMinimum: amountOutMinWei
    };

    // Encode swap data
    const swapData = this.router.interface.encodeFunctionData('exactInput', [swapParams]);

    // WSEI is an ERC20 token, not native SEI, so we never send value with swap
    // Value would only be sent if we were wrapping native SEI to WSEI first
    const value = ethers.BigNumber.from(0);

    return {
      to: this.config.dexes.dragonswap.swapRouter,
      data: swapData,
      value: value.toString(),
      gasLimit: (150000 * path.length).toString(), // More gas for multi-hop
      params: {
        path: tokenInfos.map(t => t.symbol).join(' → '),
        amountIn: amountIn.toString(),
        amountOutMin: amountOutMin.toString(),
        deadline,
        recipient
      }
    };
  }

  /**
   * Calculate price impact
   */
  calculatePriceImpact(sqrtPriceX96Before, sqrtPriceX96After) {
    const priceBefore = Math.pow(parseInt(sqrtPriceX96Before) / Math.pow(2, 96), 2);
    const priceAfter = Math.pow(parseInt(sqrtPriceX96After) / Math.pow(2, 96), 2);
    return Math.abs((priceAfter - priceBefore) / priceBefore * 100);
  }

  /**
   * Encode path for multi-hop swaps
   */
  encodePath(pathWithFees) {
    let encoded = '0x';
    for (let i = 0; i < pathWithFees.length; i++) {
      if (i % 2 === 0) {
        // Token address
        encoded += pathWithFees[i].slice(2);
      } else {
        // Fee (3 bytes)
        encoded += pathWithFees[i].toString(16).padStart(6, '0');
      }
    }
    return encoded;
  }

  /**
   * Get pool info
   */
  async getPoolInfo(tokenA, tokenB, fee) {
    try {
      const poolAddress = await this.factory.getPool(tokenA, tokenB, fee);
      
      if (!poolAddress || poolAddress === ethers.constants.AddressZero) {
        return null;
      }

      const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
      const [slot0, liquidity, token0, token1, tickSpacing] = await Promise.all([
        pool.slot0(),
        pool.liquidity(),
        pool.token0(),
        pool.token1(),
        pool.tickSpacing()
      ]);

      // Get token info
      const [token0Info, token1Info] = await Promise.all([
        this.getTokenInfo(token0),
        this.getTokenInfo(token1)
      ]);

      // Calculate price from sqrtPriceX96
      const sqrtPrice = parseInt(slot0.sqrtPriceX96) / Math.pow(2, 96);
      const price = Math.pow(sqrtPrice, 2);
      
      // Adjust for decimals
      const decimal0 = token0Info.decimals;
      const decimal1 = token1Info.decimals;
      const adjustedPrice = price * Math.pow(10, decimal0 - decimal1);

      return {
        address: poolAddress,
        token0: token0Info,
        token1: token1Info,
        fee,
        liquidity: ethers.utils.formatUnits(liquidity, 0),
        sqrtPriceX96: slot0.sqrtPriceX96.toString(),
        tick: slot0.tick.toString(),
        tickSpacing: tickSpacing.toString(),
        price: adjustedPrice.toFixed(6),
        priceFormatted: `1 ${token0Info.symbol} = ${adjustedPrice.toFixed(6)} ${token1Info.symbol}`,
        unlocked: slot0.unlocked
      };
    } catch (error) {
      throw new Error(`Failed to get pool info: ${error.message}`);
    }
  }

  /**
   * Get all active pools
   */
  async getAllPools() {
    const tokens = Object.values(this.config.tokens).map(t => t.evm);
    const pools = [];

    // Check all token pairs
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const foundPools = await this.findBestPool(tokens[i], tokens[j]);
        
        for (const pool of foundPools) {
          if (pool.active) {
            const info = await this.getPoolInfo(tokens[i], tokens[j], pool.fee);
            if (info) {
              pools.push(info);
            }
          }
        }
      }
    }

    return pools;
  }
}

module.exports = DragonSwapV2;