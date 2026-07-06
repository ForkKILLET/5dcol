FROM node:24-alpine AS base

WORKDIR /app

ENV CI=true
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json

FROM workspace AS deps

RUN pnpm install --frozen-lockfile --filter @5dcol/backend...

FROM deps AS build

COPY packages/core packages/core
COPY packages/shared packages/shared
COPY packages/backend packages/backend

ARG GIT_COMMIT=""
ARG BUILD_DATE=""

RUN GIT_COMMIT="$GIT_COMMIT" BUILD_DATE="$BUILD_DATE" pnpm -F @5dcol/backend build

FROM workspace AS prod-deps

ENV NODE_ENV=production

RUN pnpm install --prod --frozen-lockfile --filter @5dcol/backend...

FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5161
ENV MATCH_DATABASE_FILE=/app/data/rooms.sqlite
ENV MATCH_LEGACY_DATA_FILE=/app/data/rooms.json

COPY --from=prod-deps /app /app
COPY --from=build /app/packages/backend/dist packages/backend/dist
COPY --from=build /app/packages/backend/drizzle packages/backend/drizzle

EXPOSE 5161

CMD ["node", "./packages/backend/dist/index.js"]
