FROM node:22-alpine

WORKDIR /app

ENV CI=true
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm -r run build

ENV HOST=0.0.0.0
ENV PORT=5161

EXPOSE $PORT

CMD ["node", "./packages/backend/dist/index.js"]
