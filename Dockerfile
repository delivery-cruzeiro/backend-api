# Build stage
FROM node:22-alpine AS builder

WORKDIR /workspace

RUN npm install -g pnpm

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY shared-types/package.json ./shared-types/package.json
COPY backend-api/package.json ./backend-api/package.json

RUN pnpm install --filter delivery-cruzeiro-api... --ignore-scripts --no-strict-peer-dependencies

COPY shared-types ./shared-types
COPY backend-api ./backend-api

RUN pnpm --filter @delivery-cruzeiro/types build

WORKDIR /workspace/backend-api

# A disposable DATABASE_URL is enough for generation; runtime uses docker-compose env.
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/delivery_cruzeiro?schema=public" pnpm run prisma:generate

RUN pnpm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /workspace

RUN npm install -g pnpm

RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

COPY --from=builder --chown=nodejs:nodejs /workspace/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /workspace/backend-api/node_modules ./backend-api/node_modules
COPY --from=builder --chown=nodejs:nodejs /workspace/shared-types/node_modules ./shared-types/node_modules
COPY --from=builder --chown=nodejs:nodejs /workspace/backend-api/package.json ./backend-api/package.json
COPY --from=builder --chown=nodejs:nodejs /workspace/backend-api/dist ./backend-api/dist
COPY --from=builder --chown=nodejs:nodejs /workspace/backend-api/prisma ./backend-api/prisma
COPY --from=builder --chown=nodejs:nodejs /workspace/backend-api/prisma.config.ts ./backend-api/prisma.config.ts
COPY --from=builder --chown=nodejs:nodejs /workspace/shared-types/package.json ./shared-types/package.json
COPY --from=builder --chown=nodejs:nodejs /workspace/shared-types/dist ./shared-types/dist

COPY --chown=nodejs:nodejs backend-api/docker-entrypoint.sh ./backend-api/docker-entrypoint.sh
RUN chmod +x ./backend-api/docker-entrypoint.sh

WORKDIR /workspace/backend-api

USER nodejs

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
