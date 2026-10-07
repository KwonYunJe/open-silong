FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No default on purpose. This used to default to the maintainer's own
# self-hosted backend, which has been down since 2026-06-04 — a self-hoster
# who forgot the build-arg got an image silently pointed at someone else's
# (dead) deployment. Pass your own:
#   docker build --build-arg NEXT_PUBLIC_CONVEX_URL=https://<you>.convex.cloud
ARG NEXT_PUBLIC_CONVEX_URL
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

# Fail the build rather than ship an image whose client cannot reach a backend.
RUN test -n "$NEXT_PUBLIC_CONVEX_URL" || { \
      echo "ERROR: NEXT_PUBLIC_CONVEX_URL build-arg is required."; \
      echo "  docker build --build-arg NEXT_PUBLIC_CONVEX_URL=https://<you>.convex.cloud ."; \
      exit 1; \
    }
RUN bun run build

# Runtime stays on node — `output: "standalone"` emits a node server.js, and the
# node image is smaller than a bun base for a process that only serves it.
# Re-measured 2026-08-30: bun is NOT faster at serving this output. Boot to
# first served request, 3 runs each: node 602/627/647 ms, bun 1144/656/664 ms.
# There is no runtime win to collect here; do not "upgrade" this to oven/bun.
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
