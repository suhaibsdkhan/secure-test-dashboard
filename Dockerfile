# ---- build: compile the React app and the API ----
FROM node:26-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps ./apps
RUN npm run build

# ---- deps: production-only node_modules for the API ----
FROM node:26-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root=false

# ---- runtime: distroless (no shell, no package manager), runs as a non-root user ----
FROM gcr.io/distroless/nodejs22-debian13:nonroot
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/public \
    PGSSLROOTCERT=/app/certs/rds-global-bundle.pem
WORKDIR /app
# CA bundle for verifying the RDS TLS certificate.
ADD --chmod=444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
COPY --from=deps /src/node_modules ./node_modules
COPY --from=build /src/apps/api/dist ./dist
COPY --from=build /src/apps/api/package.json ./package.json
COPY apps/api/migrations ./migrations
COPY --from=build /src/apps/web/dist ./public
USER nonroot
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["dist/server.js"]
