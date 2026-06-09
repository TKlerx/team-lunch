# ── Build stage ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.0 --activate

ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm exec prisma generate

COPY tsconfig.json tsconfig.build.json vite.config.ts index.html tailwind.config.ts postcss.config.js ./
COPY assets ./assets
COPY import ./import
COPY src ./src

RUN pnpm run build

# ── Production stage ───────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@11.1.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# The Prisma client (incl. query engine) is bundled into dist by the build step
# (scripts/copy-prisma-client.mjs), so no separate .prisma copy is needed.
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

EXPOSE 3000

USER node

CMD ["node", "dist/server/index.js"]
