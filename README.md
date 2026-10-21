# Historical Timeline

A Next.js historical timeline editor with browser-local storage and optional Supabase-backed API routes.

## Data modes

- The editor stores its current items and tags in the browser. It does not automatically sync local data to Supabase.
- Supabase API routes provide hosted timeline, authentication, comments, reactions, view tracking, duplication, and asset operations.
- Public routes at `/timeline/[slug]` and `/embed/[slug]` render hosted timeline entries. They require Supabase configuration and a published timeline.
- Without Supabase environment variables, the existing local editor remains available.

## Supabase setup

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor for a new project. For an existing project, apply SQL files in [`supabase/migrations`](supabase/migrations) in filename order.
3. Copy `.env.example` to `.env.local`.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Start the app with `npm run dev`.

The API is available under `/api`: authentication, timeline CRUD, item CRUD, comments, likes, views, duplication, sharing, and private asset uploads. Hosted item updates and deletes use `/api/timelines/[id]/items/[itemId]`.

## Checks

```bash
npm run lint
npm test
npm run build
```

First, run the development server:
The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
