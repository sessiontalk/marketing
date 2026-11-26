# syntax=docker/dockerfile:1
# Marketing CRM image for the DigitalOcean droplet (see deploy/README.md).
# PUBLIC REPO: this file must never contain secrets. Runtime config comes from
# `docker run --env-file /etc/marketing-crm/app.env` on the droplet only.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
# Next inlines NEXT_PUBLIC_* at build time (not a secret).
ARG NEXT_PUBLIC_APP_URL=https://marketing.sessiontalk.co.uk
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=127.0.0.1 \
    PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/worker/health" || exit 1
CMD ["node", "server.js"]
