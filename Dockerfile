# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM node:25-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# better-sqlite3 ships prebuilt binaries for linux x64/arm64 glibc; python and
# build tools are only needed as a fallback when no prebuild matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Build-time placeholders only; real values come from the runtime environment.
ENV MAIL_IMAP_HOST=build.invalid MAIL_SMTP_HOST=build.invalid SESSION_SECRET=build-placeholder-secret-not-used-at-runtime-0000
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage (standalone output, non-root, small)
# ---------------------------------------------------------------------------
FROM node:25-bookworm-slim AS runner
WORKDIR /app
# Set by the release workflow; shown in Settings → About and diagnostics.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/webmail.db \
    UPLOAD_DIR=/data/uploads
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tini && rm -rf /var/lib/apt/lists/* \
    && groupadd -r webmail && useradd -r -g webmail -d /app webmail \
    && mkdir -p /data && chown webmail:webmail /data
COPY --from=builder --chown=webmail:webmail /app/.next/standalone ./
COPY --from=builder --chown=webmail:webmail /app/.next/static ./.next/static
COPY --from=builder --chown=webmail:webmail /app/public ./public
USER webmail
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://localhost:3000/api/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
