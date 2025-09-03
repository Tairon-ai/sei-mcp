FROM node:lts-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose port 8080 for HTTP server
EXPOSE 8080

# Set environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start the HTTP server
CMD ["node", "server.js"]
