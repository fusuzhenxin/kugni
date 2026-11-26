FROM node:22-bookworm-slim AS build
WORKDIR /srv/web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web .
COPY shared/locales /srv/shared/locales
COPY scripts/build-platform-styles.cjs /srv/scripts/build-platform-styles.cjs
ARG API_INTERNAL_URL=http://api:8000
ARG SITE_URL=https://www.kugni.com
ENV API_INTERNAL_URL=$API_INTERNAL_URL SITE_URL=$SITE_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /srv
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
RUN useradd --create-home kugni
COPY --from=build --chown=kugni:kugni /srv/web/.next/standalone ./
COPY --from=build --chown=kugni:kugni /srv/web/.next/static ./web/.next/static
COPY --from=build --chown=kugni:kugni /srv/web/public ./web/public
USER kugni
EXPOSE 3000
CMD ["node", "web/server.js"]
