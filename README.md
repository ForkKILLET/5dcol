# 5DC OL

[English](./README.md) | [中文](./README.zh.md)

5DC OL is a fan-made, open-source online web version of
[5D Chess With Multiverse Time Travel](https://store.steampowered.com/app/1349230/5D_Chess_With_Multiverse_Time_Travel/).

The project aims to make 5D Chess easier to access, play, inspect, modify, and
extend from a browser while staying close to the original game's interface and
feel. The original game is by Conor Petersen / Thunkspace.

Playable site: <https://icelava.top/5dcol/>

## Status

5DC OL currently supports local play, online match rooms, 5dpgn import/export,
spectating, and replay. The project is still in active development, so rules,
networking, and UI details may continue to be refined.

## Features

- Play 5D Chess in the browser, with an interface and feel close to the
  original game.
- Local games and online match rooms.
- Public rooms, private share-link rooms, reconnecting to unfinished online
  games, and player presence.
- Spectating and replay for rooms that allow it.
- Live opponent pending moves, move-range previews on active boards, forfeit,
  and chess clocks.
- Live 5dpgn record panel with cursor navigation, import/export, rollback,
  branching, and deduction from earlier positions.
- Linear and tree-shaped record export for games with variations.
- Readable 5dpgn display options, including piece symbols, travel markers,
  capture markers, check/mate markers, and promotion markers.
- English and Chinese UI.
- Sound, settings persistence, touch-friendly controls, and a main-menu
  animation.

## Packages

- `@5dcol/core`: game-state model, rules, move generation, check detection,
  checkmate detection, and 5dpgn import/export utilities.
- `@5dcol/frontend`: Vue/Vite browser frontend, DOM UI, canvas/WebGL rendering,
  i18n, sound, local persistence, record-tree UI, and match-room UI.
- `@5dcol/shared`: shared protocol types and Zod runtime schemas for frontend
  and backend communication.
- `@5dcol/backend`: Fastify backend for online matches, WebSocket room updates,
  CORS, authoritative action submission, user/session recovery, and
  Drizzle + SQLite persistence.

## Development

Install dependencies:

```bash
pnpm install
```

Run package dev tasks as needed:

```bash
pnpm -F @5dcol/core dev
pnpm -F @5dcol/shared dev
pnpm -F @5dcol/backend dev
pnpm -F @5dcol/frontend dev
```

The backend debug server listens on `localhost:5161` by default. Configure it
with:

- `PORT`: backend port.
- `HOST`: backend host.
- `NAME`: advertised server name.
- `MATCH_DATABASE_FILE`: SQLite database path.
- `MATCH_LEGACY_DATA_FILE`: optional legacy JSON room-data path for migration.

Useful targeted checks:

```bash
pnpm -F @5dcol/core exec tsc -p tsconfig.json --noEmit
pnpm -F @5dcol/shared exec tsc -p tsconfig.json --noEmit
pnpm -F @5dcol/backend exec tsc -p tsconfig.json --noEmit
pnpm -F @5dcol/frontend exec vue-tsc --noEmit
```

## Backend Deployment

Build the backend first:

```bash
pnpm install
pnpm -F @5dcol/backend build
```

### PM2

```bash
HOST=0.0.0.0 pm2 start ./packages/backend/dist/main.js --name 5dcol-backend --update-env
```

Common environment variables:

- `PORT=5161`
- `HOST=0.0.0.0`
- `NAME="5DC OL Server"`
- `MATCH_DATABASE_FILE=/path/to/rooms.sqlite`

### Docker

```bash
docker build \
  --build-arg GIT_COMMIT="$(git rev-parse --short=12 HEAD)" \
  --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -f docker/Dockerfile \
  -t 5dcol-backend \
  .
docker run -d \
  --name 5dcol-backend \
  -p 5161:5161 \
  -e HOST=0.0.0.0 \
  -e PORT=5161 \
  -v 5dcol-backend-data:/app/data \
  5dcol-backend
```

### Docker Compose

```bash
GIT_COMMIT="$(git rev-parse --short=12 HEAD)" \
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  docker compose -f docker/docker-compose.yml up -d --build
```

Adjust the compose file if your reverse proxy or hosting setup needs additional
ports, volumes, or networks.

## Acknowledgements

The hypercuboid checkmate algorithm is based on the implementation and ideas
from [ftxi/5dchess_engine](https://github.com/ftxi/5dchess_engine).

5DC OL is an unofficial fan project and is not affiliated with Thunkspace or
the original 5D Chess team.

## License

[MIT](./LICENSE)
