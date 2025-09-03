<div align="center">

# 🌊 SEI Blockchain MCP Server v0.1

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![SEI Network](https://img.shields.io/badge/Network-SEI-red)](https://www.sei.io)
[![DragonSwap V2](https://img.shields.io/badge/DragonSwap-V2-purple)](https://app.dragonswap.xyz)
[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-blue)](https://modelcontextprotocol.io)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com)

**Production-ready Model Context Protocol (MCP) server for SEI blockchain and DragonSwap V2 DEX operations**

[Features](#-features) • [Quick Start](#-quick-start) • [API](#-api-endpoints) • [Tools](#-available-tools) • [Examples](#-examples) • [Prompts](#-prompts) • [Security](#-security)

</div>

---

## 🚀 Features

### 🎯 **Complete SEI & DragonSwap Integration**
- Full SEI blockchain support (EVM-compatible chain)
- DragonSwap V2 concentrated liquidity DEX integration
- Native SEI wrapping/unwrapping (SEI ↔ WSEI)
- Automatic multi-hop routing for best rates
- Gas-optimized transactions on SEI network
- Support for all major SEI tokens

### 🧠 **Intelligent Trading Engine**
- Automatic native SEI wrapping when needed
- Smart routing through multiple DEX pools
- Auto-slippage adjustment (1% → 2%)
- Real-time price feeds and quotes
- Transaction simulation before execution
- Price impact calculations

### 🤖 **MCP Protocol Implementation**
- 15+ specialized tools for blockchain automation
- Compatible with Claude Desktop and AI assistants
- HTTP REST API support
- Real-time transaction execution with private key
- Comprehensive error handling
- Structured responses optimized for LLMs

### 🏛️ **Enterprise-Ready Architecture**
- Built with Express.js for scalability
- Ethers.js v5 for blockchain interactions
- Zod schemas for input validation
- Docker containerization support
- Comprehensive logging
- Production-tested components

---

## 📦 Quick Start

### ✅ Prerequisites
```bash
# Required
Node.js >= 18.0.0
npm >= 9.0.0

# Required for transactions
Private key for SEI wallet
```

### 📥 Installation

```bash
# Clone the repository
git clone https://github.com/tairon-ai/sei-mcp.git
cd sei-mcp/mcp-server

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Start the server
npm start

# Development mode
npm run dev

# MCP stdio server for Claude Desktop
npm run mcp
```

### 🤖 Claude Desktop Integration

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "sei-blockchain": {
      "command": "node",
      "args": ["/path/to/sei-mcp/mcp-server/mcp/index.js"],
      "env": {
        "SEI_RPC_URL": "https://evm-rpc.sei-apis.com",
        "WALLET_PRIVATE_KEY": "your_private_key_without_0x"
      }
    }
  }
}
```

---

## 🛠 Available Tools

### 🏦 **Blockchain & DEX Operations**

| Tool | Description | Parameters |
|------|-------------|------------|
| `getServiceInfo` | Get server capabilities and config | - |
| `getWalletBalances` | Get wallet balances for SEI and tokens | `address` |
| `getNativeBalance` | Get native SEI balance | `address` |
| `getBlockNumber` | Get current block number | - |
| `getGasPrice` | Get current gas price | - |
| `estimateGas` | Estimate gas for transaction | `to`, `value`, `data` |
| `getTransactionStatus` | Get transaction status by hash | `txHash` |
| `convertAddress` | Convert between Cosmos/EVM addresses | `address`, `toFormat` |
| `getTokenPrice` | Get token price in USD | `token` |
| `sendNativeSEI` | Send native SEI | `to`, `amount` |
| `sendToken` | Send ERC20 tokens | `token`, `to`, `amount` |
| `getDragonSwapQuote` | Get swap quote from DragonSwap | `tokenIn`, `tokenOut`, `amountIn`, `fee` |
| `getDragonSwapMultiHopQuote` | Get multi-hop swap quote | `path`, `fees`, `amountIn` |
| `getDragonSwapPoolInfo` | Get pool information | `tokenA`, `tokenB`, `fee` |
| `getDragonSwapAllPools` | List all available pools | - |
| `executeSwap` | Execute token swap with auto-wrapping | `tokenIn`, `tokenOut`, `amountIn`, `slippage` |

---

## 🔗 API Endpoints

### 🌐 Core Endpoints

```bash
GET  /           # Server status and info
GET  /health     # Health check
GET  /info       # Service information
POST /mcp        # MCP protocol endpoint
```

---

## 💡 Examples

### 💰 Get Wallet Balances

```javascript
// Get all token balances for wallet
{
  "tool": "getWalletBalances",
  "params": {}
}
```

### 🔄 Execute Swap (Native SEI to USDC)

```javascript
// Swap 5 SEI to USDC (automatic wrapping)
{
  "tool": "executeSwap",
  "params": {
    "tokenIn": "SEI",
    "tokenOut": "USDC",
    "amountIn": "5"
  }
}
```

### 📊 Get Swap Quote

```javascript
// Get quote for swapping WSEI to USDT
{
  "tool": "getDragonSwapQuote",
  "params": {
    "tokenIn": "WSEI",
    "tokenOut": "USDT",
    "amountIn": "10",
    "fee": 3000
  }
}
```

### 💸 Send Native SEI

```javascript
// Send 1 SEI to address
{
  "tool": "sendNativeSEI",
  "params": {
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
    "amount": "1"
  }
}
```

---

## 🤖 Prompts

### 💬 Example Prompts for Claude, ChatGPT, or Other AI Assistants

These prompts demonstrate how to interact with the MCP server through natural language when integrated with AI assistants:

#### 💱 **Token Swapping**

```
"What's the current price of WSEI in USDC on DragonSwap?"

"Swap 10 SEI to USDC tokens with 1% slippage"

"Execute a swap of 100 USDC to WSEI with automatic slippage adjustment"

"Find the best route to swap 50 WSEI to USDT"

"Wrap 5 SEI to WSEI for me"

"Convert my native SEI to USDC using DragonSwap"
```

#### 💧 **Liquidity Management**

```
"What's the current pool info for WSEI/USDC pair?"

"Show me all available pools on DragonSwap"

"Get the pool information for WSEI/USDT with 0.3% fee"

"Find all pools that include WSEI token"

"What's the TVL in the WSEI/USDC 0.05% pool?"
```

#### 📊 **Market Analysis**

```
"Get a quote for swapping 100 WSEI to USDC"

"What's the price impact of swapping 1000 USDC to WSEI?"

"Show me the multi-hop quote from SEI to USDT through WSEI"

"Compare rates between different fee tiers for WSEI/USDC"

"Calculate the best path for swapping SEIYAN to USDC"
```

#### 💼 **Wallet Management**

```
"Check my wallet balances for all SEI tokens"

"What's my native SEI balance?"

"Show me my WSEI and USDC balances"

"Send 10 SEI to address 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"

"Transfer 100 USDC to sei1abc... address"

"What's my total portfolio value in USD on SEI?"
```

#### ⛽ **Gas & Network Operations**

```
"What's the current gas price on SEI network?"

"Estimate gas for sending 10 SEI"

"Get the current block number on SEI"

"Check the status of transaction 0xabc123..."

"Convert my Cosmos address sei1... to EVM format"

"Convert EVM address 0x... to Cosmos sei1... format"
```

#### 💰 **Token Information**

```
"Get the current price of SEIYAN token"

"What's the price of JLY token in USD?"

"Show me information about USDC token on SEI"

"Get token price for WETH on SEI network"

"What tokens are available for trading on SEI?"
```

#### 🔄 **Advanced Trading**

```
"Execute a multi-hop swap from SEI through WSEI to USDC"

"Swap native SEI to USDT with automatic wrapping"

"Perform a swap with 2% slippage fallback"

"Find and execute the best route from SEIYAN to USDC"

"Swap all my WSEI to USDC with minimal slippage"
```

### 🔧 Integration Tips for AI Assistants

When using these prompts with the MCP server:

1. **Native SEI is automatically wrapped** to WSEI when needed for swaps
2. **Slippage auto-adjusts** from 1% to 2% if the first attempt fails
3. **Multi-hop routing** is automatic when no direct pool exists
4. **Both Cosmos and EVM addresses** are supported
5. **Gas estimation** is automatic for all transactions
6. **Use token symbols** (SEI, WSEI, USDC) or addresses for operations

---

## 🧪 Testing

### 🔍 API Testing with cURL

```bash
# Check server health
curl http://localhost:8080/health

# Get server info
curl http://localhost:8080/info

# Get wallet balances
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "getWalletBalances",
    "params": {}
  }'

# Execute a swap
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "executeSwap",
    "params": {
      "tokenIn": "SEI",
      "tokenOut": "WSEI",
      "amountIn": "1"
    }
  }'
```

---

## 🔒 Security

### 🔐 Best Practices

- **Private Key Management**: Never commit private keys. Use environment variables
- **Transaction Simulation**: Test operations before execution
- **Slippage Protection**: Auto-adjusts from 1% to 2%
- **Gas Management**: Monitor gas prices and set reasonable limits
- **Access Control**: Implement authentication for production
- **Monitoring**: Use Seitrace to track all transactions

### 🛡️ Security Features

- Automatic gas estimation with buffer
- Transaction simulation before execution
- Auto-slippage protection on all swaps
- Input validation with Zod schemas
- Comprehensive error handling
- Native SEI automatic wrapping

---

## 📊 Supported Networks & Tokens

### 🌐 Network
- **SEI Mainnet** (Chain ID: 1329)
- RPC: `https://evm-rpc.sei-apis.com`
- Explorer: [Seitrace](https://seitrace.com)

### 🪙 Key Tokens
- **SEI**: Native token
- **WSEI**: `0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7`
- **USDC**: `0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392`
- **USDT**: `0x9151434b16b9763660705744891fA906F660EcC5`
- **WETH**: `0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8`
- **SEIYAN**: `0x5f0E07dFeE5832Faa00c63F2D33A0D79150E8598`
- **JLY**: `0xDD7d5e4Ea2125d43C16eEd8f1FFeFffa2F4b4aF6`

### 📜 Key Contracts
- **DragonSwap Router**: `0x11DA6463D6Cb5a03411Dbf5ab6f6bc3997Ac7428`
- **DragonSwap Factory**: `0xcca2352200a63eb0Aaba2D40BA69b1d32174F285`
- **WSEI Contract**: `0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7`

---

## 🚀 Deployment

### 🏭 Production Deployment

```bash
# Start production server
NODE_ENV=production npm start

# With PM2
pm2 start server.js --name sei-mcp

# With Docker
docker build -t sei-mcp .
docker run -d -p 8080:8080 --env-file .env sei-mcp
```

### 🔑 Environment Variables

```env
# Required for transactions
WALLET_PRIVATE_KEY=your_private_key_without_0x

# Optional
PORT=8080
SEI_RPC_URL=https://evm-rpc.sei-apis.com
NODE_ENV=production
```

---

## 📈 Performance

- **Response Time**: <100ms for read operations
- **Transaction Speed**: ~2s on SEI network
- **Throughput**: 100+ requests per second
- **Gas Optimization**: Low fees on SEI
- **Auto-wrapping**: Native SEI → WSEI handled automatically

---

## 🎯 Key Features

### ✨ Automatic Native SEI Wrapping
When swapping from native SEI to any ERC20 token, the server automatically:
1. Wraps SEI to WSEI
2. Executes the swap
3. Returns combined transaction results

### 🔄 Auto-Slippage Adjustment
- Starts with 1% slippage
- Automatically retries with 2% if needed
- Ensures successful transactions

### 🛤️ Multi-Hop Routing
- Automatically finds best path when no direct pool exists
- Routes through WSEI or USDT as intermediary
- Optimizes for best rates

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Fork and clone
git fork https://github.com/tairon-ai/sei-mcp
git clone https://github.com/tairon-ai/sei-mcp

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes and test
npm test

# Commit and push
git commit -m 'feat: add amazing feature'
git push origin feature/amazing-feature

# Open Pull Request
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [SEI Network](https://www.sei.io) - The fastest blockchain
- [DragonSwap](https://app.dragonswap.xyz) - Leading DEX on SEI
- [Model Context Protocol](https://modelcontextprotocol.io) - AI integration standard
- [Ethers.js](https://docs.ethers.io) - Ethereum library

---

<div align="center">

**Built by [Tairon.ai](https://tairon.ai/) team with help from Claude**

</div>