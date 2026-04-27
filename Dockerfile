ARG NODE_IMAGE=node:20-bookworm-slim

FROM ${NODE_IMAGE} AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml .npmrc ./

RUN corepack prepare pnpm@9.0.0 --activate \
  && pnpm install --frozen-lockfile

COPY . .

RUN pnpm next build \
  && pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify \
  && pnpm prune --prod


FROM ${NODE_IMAGE} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV COZE_PROJECT_ENV=PROD
ENV HOSTNAME=0.0.0.0
ENV PORT=5000
ENV SQLITE_DATABASE_PATH=/data/llmmonitoring.db

RUN mkdir -p /data \
  && chown -R node:node /data

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 5000

CMD ["node", "dist/server.js"]
