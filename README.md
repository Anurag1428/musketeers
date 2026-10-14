# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```

## Database with Drizzle and Neon

Runtime queries use Drizzle ORM with Neon's serverless HTTP driver through
`lib/neon-db.ts`. Add application tables to `lib/db/schema.ts`.

Use the pooled `DATABASE_URL` for application traffic and the direct
`DATABASE_URL_UNPOOLED` connection for Drizzle Kit database changes:

```bash
npm run db:push
```

The Drizzle configuration is in `drizzle.config.ts`. This project uses
database push and does not generate or run migration files.
