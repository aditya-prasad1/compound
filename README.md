# compound.

Compound is a chat-first nutrition and workout tracker built around the
compounding effect of small, consistent actions.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Google sign-in

Create `.env.local` in the project root with these values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Never expose or commit `SUPABASE_SERVICE_ROLE_KEY`.

In Google Cloud, create a Web OAuth client and add the Supabase callback URL
as an authorized redirect URI:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Paste the Google client ID and secret into Supabase Dashboard →
Authentication → Providers → Google. Add the app origin to Supabase
Authentication → URL Configuration → Redirect URLs:

- `http://localhost:3000`
- your production app URL

Run `supabase/schema.sql` in the Supabase SQL Editor before testing sync.
The schema creates the meal and workout tables, unique constraints, and
row-level security policies.

The app uses Supabase OAuth from the settings panel. The browser sends the
Supabase access token to the sync API; the server validates that token before
using the service role to persist data. Without a signed-in account, meals and
workouts remain available locally but are not synced to Supabase.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
