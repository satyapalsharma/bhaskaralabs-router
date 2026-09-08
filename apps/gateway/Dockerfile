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
RUN mkdir -p apps/gateway/node_modules/@bhaskara \
  && ln -sfn /app/packages/shared apps/gateway/node_modules/@bhaskara/shared \
  && cd apps/gateway && bunx tsc --noEmit
WORKDIR /app/apps/gateway
ENV PORT=8793
EXPOSE 8793
# Env comes from compose env_file (.env.deploy). Bun auto-loads ./apps .env
# files too — keep ALL gateway secrets in .env.deploy only, nowhere else.
CMD ["bun", "run", "src/index.ts"]
