FROM node:20-slim

# Install Chromium + dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# CREATE SYMLINK - FIX VOOR RAILWAY CHROMIUM PATH
RUN ln -s /usr/bin/chromium /usr/bin/chromium-browser

# Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with fallback strategy
# Try npm ci first (faster), fallback to npm install if it fails
RUN npm ci --omit=dev --legacy-peer-deps 2>/dev/null || \
    npm install --omit=dev --legacy-peer-deps

# Copy application files
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
