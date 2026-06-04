# 5dcol

5dcol is an open-source web implementation of 5D Chess.

The project aims to make 5D Chess easier to access, inspect, modify, and extend from a browser. It is organized as a pnpm monorepo with a reusable core rules package and a Vue/Rsbuild frontend.

## Features

- Browser-based 5D Chess gameplay
- Core game logic separated from the frontend
- Live notation display
- 5dpgn import and export
- Move history rollback
- Internationalization, currently English and Chinese

## Planned Work

- Mobile-friendly UI
- Online multiplayer
- Opening and position editor

## Packages

- `@5dcol/core`: game-state model, rules, move generation, checkmate detection, and 5dpgn utilities
- `@5dcol/frontend`: browser UI built with Vue, Rsbuild, and canvas rendering

## Acknowledgements

The hypercube checkmate algorithm is based on the implementation and ideas from [ftxi/5dchess_engine](https://github.com/ftxi/5dchess_engine).

## Development

Install dependencies:

```bash
pnpm install
```

Run the frontend dev server:

```bash
pnpm -F @5dcol/frontend dev
```

Run the core library in watch mode:

```bash
pnpm -F @5dcol/core dev
```

Targeted type checks:

```bash
pnpm -F @5dcol/core exec tsc -p tsconfig.json --noEmit
pnpm -F @5dcol/frontend exec tsc -p tsconfig.json --noEmit
```

## License

[MIT](./LICENSE)
