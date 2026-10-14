<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git

- Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request.
- Leave changes uncommitted in the working tree on the current branch and let the user decide when and how to commit.

## Database changes

- Use Drizzle database push only (`npm run db:push` or `drizzle-kit push`).
- Never generate or run database migrations.

## Development data policy

- This is a development project with no backwards compatibility requirements.
- Existing data is disposable. Prefer data loss over preserving old data or compatibility.
- Never backfill, migrate, or preserve existing rows.
- Treat every schema change as a clean-slate reset.
