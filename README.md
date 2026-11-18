# LendLoop

A neighborhood tool-lending board. Neighbors list tools they are willing to lend, request to borrow from each other, and get notifications and reminders through n8n workflows.

Stack: Next.js (App Router), TypeScript, Clerk, Convex, n8n.

> Work in progress. This README grows with the project.

## Local setup

Requirements: Node.js 20.9+, a Clerk account, a Convex account.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Clerk application and copy its development keys into `.env.local` (see `.env.example`). With the Clerk CLI you can do it with `npx clerk link` and `npx clerk env pull`.

3. In Clerk, add a JWT template named `convex` with these claims:

   ```json
   { "aud": "convex", "name": "{{user.full_name}}", "email": "{{user.primary_email_address}}" }
   ```

4. Start Convex. The first run creates a dev deployment and writes its URLs to `.env.local`:

   ```bash
   npx convex dev
   ```

5. Tell Convex which Clerk instance to trust:

   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-instance>.clerk.accounts.dev
   ```

6. Optionally add demo listings so the board is not empty:

   ```bash
   npx convex run seed:run
   ```

   The seed is an internal mutation, so it can only be run from the CLI or the dashboard, never from the browser. Running it twice does nothing the second time.

7. In a second terminal, start the app and open http://localhost:3000:

   ```bash
   npm run dev
   ```

## Data model

Defined in `convex/schema.ts`. Shared enums (categories, conditions, loan statuses) live in `convex/model.ts` so the backend and the UI use the same values.

| Table | Purpose |
| --- | --- |
| `users` | One row per Clerk user, keyed by `tokenIdentifier`. Holds `role` (`admin` or `user`) and the `trustedLender` flag. |
| `tools` | A listing: owner, name, category, condition, short description. Removing a listing sets `removedAt` instead of deleting it, so loan history keeps pointing at a real tool. |
| `loans` | A borrow request for a date range and its lifecycle: `requested`, then `approved` / `declined` / `cancelled`, then `returned`. Dates are stored as `YYYY-MM-DD` strings so they compare correctly as text. `ownerId` is copied from the tool so "incoming requests" is a single index lookup. |
| `automationEvents` | Log of what the n8n workflows did for a loan (notification sent, reminder sent, failure). `idempotencyKey` is unique per action so a retried workflow cannot write the same event twice. |

## How auth works

- Clerk handles sign-in. `proxy.ts` runs Clerk's middleware on every request (Next.js 16 renamed `middleware.ts` to `proxy.ts`).
- `ConvexProviderWithClerk` asks Clerk for a token from the `convex` JWT template and sends it with every Convex request.
- `convex/auth.config.ts` tells Convex to accept only tokens issued by our Clerk instance (`CLERK_JWT_ISSUER_DOMAIN`) with audience `convex`. Inside Convex functions the user comes from `ctx.auth.getUserIdentity()`, never from a client argument.

## Security and data minimization

- The `convex` JWT template carries only `aud`, `name` and `email`. Nothing else from the Clerk profile reaches the backend.
- The public tool list (`tools.listPublic`) returns only `name` and `category`. Owner, condition, description and document ids are dropped on the server, so they are never sent to signed-out visitors, not just hidden in the UI.
- Secrets live only in `.env.local` (git-ignored) and in the Convex deployment's environment variables.
