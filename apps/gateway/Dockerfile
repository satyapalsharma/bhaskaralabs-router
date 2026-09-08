# Gateway image. Mirrors local dev: bun + manual @bhaskara/shared symlink
# (repo has no workspaces field — see root package.json; do NOT "fix" here).
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/gateway/package.json ./apps/gateway/
# Not --frozen-lockfile: root manifest/lock drift; correctness over speed.
RUN bun install
RUN cd apps/gateway && bun install
COPY packages/shared ./packages/shared
COPY apps/gateway ./apps/gateway
# Schema lives in apps/web (single source; proper fix = move to packages/shared).
COPY apps/web/src/db ./apps/web/src/db
# drizzle-orm resolves from the importing file upward; web/node_modules is not
# installed in this image, so link the identical gateway copy (same ^0.45.2).
RUN mkdir -p apps/web/node_modules && ln -sfn /app/apps/gateway/node_modules/drizzle-orm apps/web/node_modules/drizzle-orm
RUN cd apps/gateway && bunx tsc --noEmit
WORKDIR /app/apps/gateway
ENV PORT=8793
EXPOSE 8793
# Env comes from compose env_file (.env.deploy). Bun auto-loads ./apps .env
# files too — keep ALL gateway secrets in .env.deploy only, nowhere else.
CMD ["bun", "run", "src/index.ts"]
