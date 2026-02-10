# Use Node.js 20 Alpine for building
FROM node:20-alpine AS builder

WORKDIR /app

# Build-time API base URL (inlined into the client bundle by Next.js)
ARG API_BASE_URL
ENV API_BASE_URL=${API_BASE_URL}

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Keep the value available at runtime too (server components / diagnostics)
ARG API_BASE_URL
ENV API_BASE_URL=${API_BASE_URL}

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
RUN mkdir -p ./public
COPY --from=builder /app/public/ ./public/
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
