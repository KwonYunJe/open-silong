FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_CONVEX_URL=https://api-silong.rahmanef.com
ARG NEXT_PUBLIC_DEPLOYMENT_ID
# Build id powers the version-watcher reload prompt + chunk-error recovery.
# Dokploy passes the commit SHA via DOKPLOY_COMMIT_SHA; fall back to a
# build-time timestamp when missing so production never ships an empty id.
ARG DOKPLOY_COMMIT_SHA
ARG GITHUB_SHA
ARG NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_CONVEX_URL=$NEXT_PUBLIC_CONVEX_URL
ENV NEXT_PUBLIC_DEPLOYMENT_ID=$NEXT_PUBLIC_DEPLOYMENT_ID
ENV DOKPLOY_COMMIT_SHA=$DOKPLOY_COMMIT_SHA
ENV GITHUB_SHA=$GITHUB_SHA
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
ENV NEXT_TELEMETRY_DISABLED=1

RUN bun run build

# Runtime stays on node — `output: "standalone"` emits a node server.js, and the
# node image is smaller than a bun base for a process that only serves it.
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
