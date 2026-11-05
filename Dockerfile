# syntax=docker/dockerfile:1
FROM node:24-slim AS base
WORKDIR /app

# Production dependencies only (compiles better-sqlite3 natively if needed)
FROM base AS prod-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Full dependencies + build
FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3535 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_PATH=/app/data/app.db

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/templates ./templates
COPY --from=build /app/drizzle ./drizzle
# Needed by scripts/migrate.mjs (not always traced into the standalone output)
COPY --from=prod-deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=prod-deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY scripts ./scripts

RUN mkdir -p /app/data && chown -R node:node /app/data \
  && chmod +x /app/scripts/docker-entrypoint.sh
USER node
VOLUME ["/app/data"]
EXPOSE 3535
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]
