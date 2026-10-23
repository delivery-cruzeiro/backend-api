# syntax=docker/dockerfile:1
FROM node:22.22.0-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl
RUN npm install -g pnpm@11.24.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY vendor/ ./vendor/
ENV CI=true HUSKY=0
RUN --mount=type=cache,id=pnpm-api,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
FROM dependencies AS build
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm prisma:generate
RUN pnpm build
FROM node:22.22.0-alpine AS production
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
RUN apk add --no-cache openssl
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/package.json ./
COPY --chown=node:node docker-entrypoint.sh ./
COPY --chown=node:node scripts/migrate.mjs ./scripts/migrate.mjs
COPY --chown=node:node scripts/encrypt-existing.mjs ./scripts/encrypt-existing.mjs
RUN chmod +x docker-entrypoint.sh
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

FROM build AS verification
COPY tests ./tests
COPY scripts/verify.mjs ./scripts/verify.mjs
RUN node scripts/verify.mjs

FROM production AS final
