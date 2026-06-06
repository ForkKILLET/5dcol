# @5dcol/backend

Backend server for 5DC OL online matches.

The initial server exposes an HTTP protocol for match-room discovery, session recovery, and authoritative action submission.

```sh
pnpm -F @5dcol/backend dev
```

The default debug server listens on `localhost:5161`.

Match rooms are persisted to `data/rooms.json` by default. Set `MATCH_DATA_FILE`
to use another path.

Room state updates are pushed through Server-Sent Events at
`/rooms/:roomId/events?sessionId=...`.
