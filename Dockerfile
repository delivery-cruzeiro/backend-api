FROM node:22-alpine AS builder

WORKDIR /workspace

RUN npm install -g pnpm

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY shared-types/package.json ./shared-types/package.json

RUN pnpm install --ignore-scripts --no-strict-peer-dependencies

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY shared-types ./shared-types

RUN pnpm --filter @delivery-cruzeiro/types build

RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/delivery_cruzeiro?schema=public" pnpm run prisma:generate

RUN pnpm run build

FROM node:22-alpine AS production

WORKDIR /workspace

RUN npm install -g pnpm && \
    addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

COPY --from=builder --chown=nodejs:nodejs /workspace/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /workspace/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /workspace/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /workspace/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /workspace/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nodejs:nodejs /workspace/shared-types ./shared-types
COPY --chown=nodejs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh && \
    chown nodejs:nodejs /workspace

USER nodejs

EXPOSE 10000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
