#!/usr/bin/env node
// Load .env file if it exists
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

console.log('🚀 Starting SEI Blockchain MCP Server...');
console.log(`📍 Port: ${PORT}`);
console.log(`🔑 WALLET_PRIVATE_KEY configured: ${process.env.WALLET_PRIVATE_KEY ? 'Yes' : 'No'}`);
console.log(`🌐 SEI_RPC_URL: ${process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com'}`);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

let mcpProcess = null;
let mcpInitialized = false;
const pendingRequests = new Map();

async function initializeMCP() {
  return new Promise((resolve, reject) => {
    console.log('Initializing MCP...');
    console.log('Environment for MCP:', {
      WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY ? 'Set' : 'Not set',
      SEI_RPC_URL: process.env.SEI_RPC_URL ? 'Set' : 'Using default'
    });
    
    mcpProcess = spawn('node', ['./mcp/index.js'], {
      env: {
        ...process.env,
        WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY || '',
        SEI_RPC_URL: process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    let initTimeout = setTimeout(() => {
      reject(new Error('MCP initialization timeout'));
    }, 30000);
    
    mcpProcess.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            
            if (response.id === 'init' && response.result) {
              clearTimeout(initTimeout);
              console.log('✅ MCP initialized');
              
              // Send initialized notification
              mcpProcess.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized',
                params: {}
              }) + '\n');
              
              // Mark as initialized after notification
              setTimeout(() => {
                mcpInitialized = true;
                console.log('✅ MCP ready for requests');
              }, 500);
              
              resolve(response.result);
            }
            
            if (response.id && pendingRequests.has(response.id)) {
              const { resolve } = pendingRequests.get(response.id);
              pendingRequests.delete(response.id);
              resolve(response);
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    });

    mcpProcess.stderr.on('data', (data) => {
      console.error('MCP stderr:', data.toString());
    });

    mcpProcess.on('error', (err) => {
      clearTimeout(initTimeout);
      console.error('MCP error:', err);
      reject(err);
    });

    mcpProcess.on('exit', (code) => {
      console.log(`MCP exited: ${code}`);
      mcpInitialized = false;
    });

    // Send initialize request
    setTimeout(() => {
      mcpProcess.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'sei-mcp-http-server',
            version: '1.0.0'
          }
        },
        id: 'init'
      }) + '\n');
    }, 1000);
  });
}

async function sendMCPRequest(method, params = {}) {
  if (!mcpInitialized) {
    throw new Error('MCP not initialized');
  }

  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Request timeout'));
    }, 30000);
    
    pendingRequests.set(id, {
      resolve: (response) => {
        clearTimeout(timeout);
        resolve(response);
      },
      reject
    });
    
    mcpProcess.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id
    }) + '\n');
  });
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SEI Blockchain MCP Server',
    version: '1.0.0',
    status: mcpInitialized ? 'operational' : 'offline',
    chain: 'SEI',
    chainId: 1329,
    protocol: 'MCP',
    endpoints: ['/health', '/info', '/mcp']
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthy = mcpInitialized || mcpProcess !== null;
  res.status(healthy ? 200 : 503).json({ 
    status: healthy ? 'healthy' : 'unhealthy',
    service: 'SEI Blockchain MCP',
    version: '1.0.0',
    chain: 'SEI',
    chainId: 1329,
    timestamp: new Date().toISOString()
  });
});

// Info endpoint
app.get('/info', (req, res) => {
  res.json({
    name: 'SEI Blockchain MCP',
    description: 'MCP server for interacting with SEI blockchain and DragonSwap V2',
    version: '1.0.0',
    chain: 'SEI',
    chainId: 1329,
    rpcUrl: process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com',
    walletConfigured: !!process.env.WALLET_PRIVATE_KEY,
    dex: 'DragonSwap V2',
    capabilities: [
      'Wallet management with private key',
      'Token operations (balances, transfers, approvals)',
      'DragonSwap V2 swaps and liquidity',
      'Transaction preparation and execution',
      'Gas estimation and management'
    ]
  });
});

// MCP Protocol endpoint (JSON-RPC)
app.post('/mcp', async (req, res) => {
  try {
    const { jsonrpc, method, params, id, tool } = req.body;

    // Handle legacy format (tool + params)
    if (tool && !method) {
      if (!mcpInitialized) {
        return res.status(503).json({
          error: 'MCP not ready',
          message: 'Please wait for initialization'
        });
      }

      try {
        const response = await sendMCPRequest('tools/call', {
          name: tool,
          arguments: params || {}
        });

        return res.json({
          result: response.result,
          error: response.error || null
        });
      } catch (error) {
        return res.status(500).json({
          error: error.message
        });
      }
    }

    // Handle standard JSON-RPC format
    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: id || null
      });
    }

    switch (method) {
      case 'initialize':
        res.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'SEI Blockchain MCP',
              version: '1.0.0'
            },
            capabilities: { tools: {} }
          },
          id
        });
        break;

      case 'tools/list':
        if (!mcpInitialized) throw new Error('MCP not ready');
        const listResponse = await sendMCPRequest('tools/list');
        res.json({
          jsonrpc: '2.0',
          result: listResponse.result,
          id
        });
        break;

      case 'tools/call':
        if (!mcpInitialized) throw new Error('MCP not ready');
        const callResponse = await sendMCPRequest('tools/call', params);
        res.json({
          jsonrpc: '2.0',
          result: callResponse.result,
          id
        });
        break;

      default:
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id
        });
    }
  } catch (error) {
    console.error('MCP error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
      id: req.body.id || null
    });
  }
});

// MCP Discovery endpoint (GET)
app.get('/mcp', (req, res) => {
  res.json({
    name: 'SEI Blockchain MCP',
    version: '1.0.0',
    protocol_version: '2024-11-05',
    endpoint: '/mcp',
    status: mcpInitialized ? 'ready' : 'offline',
    description: 'Full-featured MCP server for SEI blockchain with wallet support',
    features: [
      'Private key wallet management',
      'Native SEI transfers',
      'ERC20 token operations',
      'DragonSwap V2 integration',
      'Transaction execution'
    ]
  });
});

// Initialize MCP
initializeMCP()
  .then(() => console.log('✅ MCP ready'))
  .catch((error) => {
    console.error('⚠️ MCP init failed:', error.message);
    console.log('Server will run with limited functionality');
  });

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SEI Blockchain MCP Server running on port ${PORT}`);
  console.log('📍 Health check: http://localhost:' + PORT + '/health');
  console.log('📍 Info: http://localhost:' + PORT + '/info');
  console.log('📍 MCP endpoint: http://localhost:' + PORT + '/mcp');
  console.log('\n✨ Ready for MCP connections!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => console.log('HTTP server closed'));
  if (mcpProcess) mcpProcess.kill('SIGTERM');
  setTimeout(() => process.exit(0), 5000);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => console.log('HTTP server closed'));
  if (mcpProcess) mcpProcess.kill('SIGTERM');
  setTimeout(() => process.exit(0), 5000);
});