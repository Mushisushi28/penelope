# ─── Stage 1: builder ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native addons (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy workspace manifests first (layer cache)
COPY package.json package-lock.json ./
COPY packages/core/package.json               packages/core/
COPY packages/agents/package.json             packages/agents/
COPY packages/adapters/package.json           packages/adapters/
COPY packages/cli/package.json                packages/cli/
COPY packages/dashboard/package.json          packages/dashboard/
COPY packages/secrets/package.json            packages/secrets/
COPY packages/connectors/package.json         packages/connectors/
COPY packages/hermes/package.json             packages/hermes/
COPY packages/marketplace/package.json        packages/marketplace/
COPY packages/procedure-eval/package.json     packages/procedure-eval/
COPY packages/billing/package.json            packages/billing/
COPY packages/telemetry/package.json          packages/telemetry/
COPY packages/audit-log/package.json          packages/audit-log/
COPY packages/connector-discovery/package.json packages/connector-discovery/
COPY packages/onboarding-web/package.json     packages/onboarding-web/

# Install all workspace dependencies
RUN npm ci

# Copy source
COPY packages/ packages/
COPY tsconfig*.json ./

# Build all TypeScript workspaces in dependency order
RUN npm run build -w packages/core \
 && npm run build -w packages/secrets \
 && npm run build -w packages/connectors \
 && npm run build -w packages/adapters \
 && npm run build -w packages/agents \
 && npm run build -w packages/cli

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Runtime system deps
RUN apk add --no-cache python3 make g++ && \
    addgroup -S penelope && adduser -S penelope -G penelope

# Copy only what is needed at runtime
COPY --from=builder /app/package.json         ./
COPY --from=builder /app/package-lock.json    ./
COPY --from=builder /app/packages/core/dist   packages/core/dist/
COPY --from=builder /app/packages/core/package.json  packages/core/
COPY --from=builder /app/packages/agents/dist packages/agents/dist/
COPY --from=builder /app/packages/agents/package.json packages/agents/
COPY --from=builder /app/packages/adapters/dist packages/adapters/dist/
COPY --from=builder /app/packages/adapters/package.json packages/adapters/
COPY --from=builder /app/packages/cli/dist    packages/cli/dist/
COPY --from=builder /app/packages/cli/bin     packages/cli/bin/
COPY --from=builder /app/packages/cli/package.json packages/cli/
COPY --from=builder /app/packages/dashboard   packages/dashboard/

# Install only production deps
RUN npm ci --omit=dev

# Make CLI globally available inside the container
RUN ln -s /app/packages/cli/bin/penelope.mjs /usr/local/bin/penelope && \
    chmod +x /usr/local/bin/penelope

# Runtime directories — mounted from host in compose
RUN mkdir -p /data/tenants /data/state && \
    chown -R penelope:penelope /data

USER penelope

# Dashboard port
EXPOSE 18900

# Health check — dashboard HTTP
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:18900/health || exit 1

ENV NODE_ENV=production \
    PENELOPE_DATA_DIR=/data

ENTRYPOINT ["penelope"]
CMD ["up"]
