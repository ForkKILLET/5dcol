# AGENTS.md

## Project Overview

- The project is an online version of the game "5D Chess With Multiverse Time Travel".
- The project is a monorepo managed with pnpm workspaces.
- The project consists of 2 main packages: `core` and `frontend`.
  - `core` is a RsLib library that provides 5D Chess game logic and utilities.
  - `frontend` is a RsBuild web application that provides the user interface for the game.

## Project Workflow

- The user normally keeps `core` and `frontend` dev servers running.
- Do not start dev server or run builds.
- Prefer targeted type checks when verification is needed:
  - `pnpm -F @5dcol/core exec tsc -p tsconfig.json --noEmit`
  - `pnpm -F @5dcol/frontend exec tsc -p tsconfig.json --noEmit`
