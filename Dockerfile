# ── Build stage ─────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.0 --activate

ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm exec prisma generate

COPY tsconfig.json tsconfig.build.json vite.config.ts index.html tailwind.config.ts postcss.config.js ./
COPY assets ./assets
COPY public ./public
COPY import ./import
COPY scripts ./scripts
COPY src ./src

RUN pnpm run build

# ── Production stage ───────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk upgrade --no-cache

RUN corepack enable && corepack prepare pnpm@11.1.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm /root/.cache/node

# Prisma 7 is engine-free (driver adapters), and its generated client is plain
# TypeScript that tsc compiles straight into dist during the build — so the
# runtime needs nothing beyond dist (no engine binary, no separate client copy).
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

EXPOSE 3000

USER node

# Internal health route also works when the public app uses BASE_PATH.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/api/health', { signal: AbortSignal.timeout(4000) }).then(async response => { if (!response.ok || (await response.json()).status !== 'ok') process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "dist/server/index.js"]
