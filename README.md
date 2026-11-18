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

6. In a second terminal, start the app and open http://localhost:3000:

   ```bash
   npm run dev
   ```

## How auth works

- Clerk handles sign-in. `proxy.ts` runs Clerk's middleware on every request (Next.js 16 renamed `middleware.ts` to `proxy.ts`).
- `ConvexProviderWithClerk` asks Clerk for a token from the `convex` JWT template and sends it with every Convex request.
- `convex/auth.config.ts` tells Convex to accept only tokens issued by our Clerk instance (`CLERK_JWT_ISSUER_DOMAIN`) with audience `convex`. Inside Convex functions the user comes from `ctx.auth.getUserIdentity()`, never from a client argument.
- `convex/viewer.ts` is a small check that returns the signed-in user's name, so you can see the Clerk to Convex link working. It will be replaced by proper user and role helpers.

## Security and data minimization

- The `convex` JWT template carries only `aud`, `name` and `email`. Nothing else from the Clerk profile reaches the backend.
- Secrets live only in `.env.local` (git-ignored) and in the Convex deployment's environment variables.
