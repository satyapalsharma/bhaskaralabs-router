# Web image (Next 16). Same install mechanics as gateway (see its Dockerfile).
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN bun install
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN mkdir -p apps/web/node_modules/@bhaskara \
  && ln -sfn /app/packages/shared apps/web/node_modules/@bhaskara/shared
WORKDIR /app/apps/web
ARG DATABASE_URL=postgres://build:build@localhost:5432/build
ENV DATABASE_URL=$DATABASE_URL NEXT_TELEMETRY_DISABLED=1
# NOTE (UNVERIFIED in CI): if build prerenders DB-backed pages and fails,
# rebuild with the real DATABASE_URL as build-arg (same box, safe).
RUN bun run build
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "start"]
