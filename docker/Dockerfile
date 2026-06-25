FROM node:22-alpine

WORKDIR /app

ENV CI=true
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY . .

ARG GIT_COMMIT=""
ARG BUILD_DATE=""

RUN pnpm install --frozen-lockfile
RUN GIT_COMMIT="$GIT_COMMIT" BUILD_DATE="$BUILD_DATE" pnpm -r run build

ENV HOST=0.0.0.0
ENV PORT=5161

EXPOSE $PORT

CMD ["node", "./packages/backend/dist/index.js"]
