# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Copy source code
COPY . .

# Remove pnpm-workspace.yaml if exists to disable workspaces during build
RUN rm -f pnpm-workspace.yaml

# Install all dependencies (including devDependencies for Prisma)
RUN pnpm install --ignore-scripts --no-strict-peer-dependencies

# Prisma Client will be generated in runtime via entrypoint (when DATABASE_URL is available)

# Build TypeScript
RUN pnpm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Remove pnpm-workspace.yaml if exists to disable workspaces during build
RUN rm -f pnpm-workspace.yaml

# Copy all dependencies from builder (including generated Prisma Client)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
