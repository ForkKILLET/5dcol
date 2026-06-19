# AGENTS.md

## Project Overview

- The project is an online version of the game "5D Chess With Multiverse Time Travel".
- The project is a monorepo managed with pnpm workspaces.
- The project consists of 4 main packages:
  - `core`: core 5D Chess game logic and 5DPGN utilities.
  - `shared`: shared protocol types and zod schemas.
  - `frontend`: Vue web application for the game UI.
  - `backend`: Fastify backend for online rooms, matches, and studies.
- The package toolchain is Vite-based.

## Project Workflow

- The user normally keeps dev servers running.
- Do not start dev server or run builds.
- For efficiency, only run checks for larger changes or before committing, and limit them to the necessary packages.
- Prefer targeted type checks when verification is needed:
  - `pnpm -F @5dcol/core check`
  - `pnpm -F @5dcol/shared check`
  - `pnpm -F @5dcol/frontend check`
  - `pnpm -F @5dcol/backend check`
- Independent, non-trivial changes may be committed without asking first when they are cleanly separable from unrelated worktree changes.
- Follow the existing commit message style, such as `feat(frontend): ...` and `fix(core, frontend): ...`.
- Documents under `work/` are planning notes, should be written in Chinese, and normally should not be committed.
