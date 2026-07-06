# 5DC OL

[English](./README.md) | [中文](./README.zh.md)

5DC OL is a fan-made, open-source online web version of
[5D Chess With Multiverse Time Travel](https://store.steampowered.com/app/1349230/5D_Chess_With_Multiverse_Time_Travel/).

The project aims to make 5D Chess easier to access, play, inspect, modify, and
extend from a browser while staying close to the original game's interface and
feel. The original game is by Conor Petersen / Thunkspace.

Playable site: <https://icelava.top/5dcol/>

## Status

5DC OL currently supports local and online versus games, local and online study
rooms, 5dpgn/FEN import and export, spectating, replay, and analysis panels.
The project is still in active development, so rules, networking, notation, and
UI details may continue to be refined.

## Features

- Play 5D Chess in the browser, with an interface and feel close to the
  original game.
- Local and online Versus / Study rooms.
- Public rooms, private share-link rooms, reconnecting to unfinished online
  games, and player presence.
- Online study rooms with members, chat, shared record edits, follow/jump
  presence, and room management.
- Spectating and replay for rooms that allow it.
- Live opponent pending moves, move-range previews on active boards, forfeit,
  and chess clocks.
- Live 5dpgn record panel with cursor navigation, import/export, rollback,
  branching, deduction from earlier positions, comments, glyphs, and board
  markers.
- Linear and tree-shaped 5dpgn export for games with variations, plus FEN
  import/export and `Size` headers for non-standard board sizes.
- Readable 5dpgn display options, including piece symbols, travel markers,
  capture markers, check/mate markers, and promotion markers.
- Customizable side-panel layout with record, minimap, XT/YT axis views, chat,
  members, and clock panels.
- English and Chinese UI.
- Sound, settings persistence, touch-friendly controls, and a main-menu
  animation.

## Packages

- `@5dcol/core`: game-state model, rules, move generation, check detection,
  checkmate detection, and 5dpgn/FEN import/export utilities.
- `@5dcol/frontend`: Vue/Vite browser frontend, DOM UI, canvas/WebGL rendering,
  i18n, sound, local persistence, record-tree UI, custom panel layout, and
  online room UI.
- `@5dcol/shared`: shared protocol types and Zod runtime schemas for frontend
  and backend communication.
- `@5dcol/backend`: Fastify backend for online versus and study rooms, WebSocket
  room updates, CORS, authoritative action / study patch submission,
  user/session recovery, chat, and Drizzle + SQLite persistence.

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
pnpm -F @5dcol/core check
pnpm -F @5dcol/shared check
pnpm -F @5dcol/backend check
pnpm -F @5dcol/frontend check
```

## Backend Deployment

Build the backend first:

```bash
pnpm install
pnpm -F @5dcol/backend build
```

### PM2

```bash
HOST=0.0.0.0 pm2 start ./packages/backend/dist/index.js --name 5dcol-backend --update-env
```

Common environment variables:

- `PORT=5161`
- `HOST=0.0.0.0`
- `NAME="5DC OL Server"`
- `MATCH_DATABASE_FILE=/path/to/rooms.sqlite`

### Local Docker Build

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
docker compose -f docker/docker-compose.yml pull
docker compose -f docker/docker-compose.yml up -d
```

The compose file uses the published
`ghcr.io/forkkillet/5dcol-backend:latest` image by default.
Set `FIVE_DCOL_BACKEND_IMAGE` if you want to deploy a different image tag.
Adjust the compose file if your reverse proxy or hosting setup needs additional
ports, volumes, or networks.

## Acknowledgements

The hypercuboid checkmate algorithm is based on the implementation and ideas
from [ftxi/5dchess_engine](https://github.com/ftxi/5dchess_engine).

The chess piece assets follow the attribution notes shipped with the original
game: standard pieces are by Colin M.L. Burnett, unicorn pieces are derived from
Burnett's knight SVGs and modified by Francois-Pier, and the dragon, brawn,
princess, royal queen, and common king pieces are derived from Burnett's piece
SVGs and modified by Conor Petersen. See
[`attributions_svg_chess_pieces.txt`](./packages/frontend/public/assets/textures/pieces/attributions_svg_chess_pieces.txt)
for source URLs and license text.

Sound effects and music follow the original game's attribution list, primarily
from Freesound under Creative Commons 0, with `wind1.wav` by Anton under
Creative Commons Attribution 3.0. See
[`attributions_sounds.txt`](./packages/frontend/public/assets/sounds/attributions_sounds.txt)
for the full source list.

5DC OL is an unofficial fan project and is not affiliated with Thunkspace or
the original 5D Chess team.

## License

[MIT](./LICENSE)
