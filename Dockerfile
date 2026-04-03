# ── Build stage ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json vite.config.ts index.html tailwind.config.ts postcss.config.js ./
COPY assets ./assets
COPY import ./import
COPY src ./src

RUN npm run build

# ── Production stage ───────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

EXPOSE 3000

USER node

CMD ["node", "dist/server/index.js"]
