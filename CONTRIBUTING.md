<div align="center">

# Contributing to SEI Blockchain MCP Server

**Thank you for your interest in contributing to the SEI Blockchain MCP Server!**

This document provides guidelines and instructions for contributing to this project.

</div>

## Code of Conduct

Please be respectful and considerate of others when contributing to this project. We aim to foster an inclusive and welcoming community for all developers in the SEI ecosystem.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue on GitHub with the following information:

- A clear, descriptive title
- A detailed description of the bug
- Steps to reproduce the bug
- Expected behavior
- Actual behavior
- Any relevant logs or screenshots
- Your environment (OS, Node.js version, npm version)
- Transaction hashes on SEI network if applicable

### Suggesting Enhancements

If you have an idea for an enhancement, please create an issue on GitHub with the following information:

- A clear, descriptive title
- A detailed description of the enhancement
- Any relevant examples or mockups
- Why this enhancement would be useful for the SEI ecosystem
- Potential implementation approach

### Pull Requests

1. Fork the repository
2. Create a new branch for your feature or bugfix (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests to ensure your changes don't break existing functionality
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request. Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) as your PR's title

## Development Setup

1. Clone your fork of the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with your credentials (see README.md)
4. Test the server: `npm start`
5. Test the MCP server: `npm run mcp`

## Coding Standards

- Follow the existing code style (JavaScript/Node.js conventions)
- Write clear, descriptive commit messages
- Add JSDoc comments to your code where necessary
- Write tests for new features when applicable
- Update documentation when necessary
- Use meaningful variable and function names
- Keep functions small and focused on a single responsibility

## Adding New MCP Tools

If you want to add a new tool to the SEI Blockchain MCP server, follow these steps:

### 1. Create the Tool Handler

Add your tool handler in the `mcp/index.js` file:

```javascript
// Define your tool using server.tool
server.tool(
  "yourToolName",
  "Clear description of what your tool does",
  {
    parameterOne: z.string().describe("Description of parameter"),
    parameterTwo: z.number().optional().describe("Optional parameter"),
  },
  async ({ parameterOne, parameterTwo }) => {
    try {
      // Implement your tool logic here
      const result = await performOperation({ parameterOne, parameterTwo });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }]
      };
    }
  }
);
```

### 2. Handle SEI-Specific Features

When adding tools that interact with SEI blockchain:

```javascript
// Use the configured wallet for transactions
const wallet = getWallet();

// Handle native SEI wrapping if needed
if (tokenInput.toLowerCase() === 'sei') {
  // Wrap to WSEI automatically
  const wseiContract = new ethers.Contract(
    SEI_CONFIG.tokens.wsei.evm,
    WSEI_ABI,
    wallet
  );
  // ... wrapping logic
}

// Use SEI-specific configurations
const provider = new ethers.providers.JsonRpcProvider(SEI_CONFIG.rpcUrl, {
  chainId: SEI_CONFIG.chainId,
  name: SEI_CONFIG.name
});
```

### 3. Add Tests

Create test cases for your new tool:

```javascript
// test-your-tool.js
const testYourTool = async () => {
  const response = await fetch('http://localhost:8092/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'yourToolName',
      params: {
        parameterOne: 'value',
        parameterTwo: 123
      }
    })
  });
  
  const result = await response.json();
  console.log('Tool result:', result);
};
```

### 4. Update Documentation

- Add your tool to the README.md tools section
- Include example usage in the Examples section
- Document any SEI-specific behavior

## Testing Guidelines

### Running Tests

```bash
# Run all tests
npm test

# Test specific functionality
curl -X POST http://localhost:8092/mcp \
  -H "Content-Type: application/json" \
  -d '{"tool": "yourToolName", "params": {...}}'
```

### Writing Tests

- Test both success and failure cases
- Include edge cases
- Test with various parameter combinations
- Verify error messages are helpful
- Test native SEI handling
- Test WSEI wrapping scenarios

## Smart Contract Integration

When adding features that interact with new smart contracts on SEI:

1. Add the contract ABI to the appropriate section in `mcp/index.js`
2. Add contract addresses to the `SEI_CONFIG` object
3. Implement proper error handling for contract calls
4. Test on SEI testnet before mainnet integration
5. Document gas estimation considerations
6. Handle both EVM and Cosmos address formats

## DragonSwap V2 Integration

When adding DragonSwap-related features:

1. Update the `dragonswap.js` module
2. Handle concentrated liquidity pools correctly
3. Implement proper fee tier handling (100, 500, 3000, 10000)
4. Test multi-hop routing
5. Ensure slippage protection is working

## Environment Variables

When adding new environment variables:

1. Update the `.env.example` file
2. Document in README.md
3. Add validation in the code
4. Provide sensible defaults where appropriate

Example:
```javascript
const SEI_RPC_URL = process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com';
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

if (!WALLET_PRIVATE_KEY) {
  throw new Error("WALLET_PRIVATE_KEY is required for transactions");
}
```

## Documentation

- Keep README.md up to date
- Use clear, concise language
- Include code examples
- Update API documentation for new endpoints
- Add JSDoc comments for new functions
- Document SEI-specific features

## Security Considerations

- **Never commit private keys or sensitive data**
- Validate all user inputs with Zod schemas
- Handle native SEI wrapping securely
- Implement proper approval checks for token operations
- Follow security best practices for DeFi applications
- Review dependencies for vulnerabilities
- Use gas limits appropriately

## Performance Guidelines

- Optimize for gas efficiency on SEI network
- Implement caching where appropriate
- Use batch operations when possible
- Monitor RPC rate limits
- Profile code for bottlenecks
- Handle automatic retries with different slippage

## SEI-Specific Considerations

### Address Formats
- Support both Cosmos (sei1...) and EVM (0x...) addresses
- Implement proper address conversion when needed

### Native Token Handling
- Automatically wrap SEI to WSEI when needed
- Handle unwrapping for user convenience

### Transaction Management
- Use appropriate gas prices for SEI network
- Implement auto-slippage adjustment (1% → 2%)
- Handle multi-hop routing through WSEI or USDT

## Submitting Your Contribution

Before submitting:

1. Ensure all tests pass
2. Update documentation
3. Check for linting issues
4. Verify no sensitive data is included
5. Write a clear PR description
6. Test on SEI mainnet if applicable

## Getting Help

If you need help with your contribution:

- Check existing issues and PRs
- Ask questions in the issue tracker
- Review SEI documentation at [sei.io](https://www.sei.io)
- Check DragonSwap docs at [app.dragonswap.xyz](https://app.dragonswap.xyz)

## Recognition

Contributors will be recognized in:

- The project README
- Release notes
- Our website (if applicable)

Thank you for helping improve the SEI Blockchain MCP Server!

---

<div align="center">

**Built by [Tairon.ai](https://tairon.ai/) team with help from Claude**

</div>