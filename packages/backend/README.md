# @5dcol/backend

Backend server for 5DC OL online versus games and study rooms.

The server uses Fastify for HTTP routes, WebSocket room updates, CORS, and
authoritative online-room state. Versus rooms, study rooms, users, and chat are
persisted with Drizzle on Node's built-in SQLite driver.

```sh
pnpm -F @5dcol/backend dev
```

The default debug server listens on `localhost:5161`.

Environment variables:

- `PORT`: backend port.
- `HOST`: backend host.
- `NAME`: advertised server name.
- `MATCH_DATABASE_FILE`: SQLite database path.
- `MATCH_LEGACY_DATA_FILE`: optional legacy JSON room-data path for migration.

Room state updates are pushed through WebSocket at:

```text
/rooms/:roomId/events?sessionId=...&userId=...
/studies/:roomId/events?sessionId=...&userId=...
```
