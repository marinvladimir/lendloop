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

8. Make yourself an admin. Sign in once first so your user row exists, then:

   ```bash
   npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
   ```

   `setRole` is an internal mutation. There is deliberately no way to become admin from the app itself, so only someone with access to the Convex deployment can hand out the role.

## Using the app

| Page | What it does |
| --- | --- |
| `/` | Public landing page with the read-only tool list. |
| `/board` | Every listed tool with condition, lender, Trusted Lender badge and availability. Filter by category, request a date range. Admins also get a Remove button on every listing. |
| `/board/listings` | Your own listings: add, edit, remove. Shows open requests per tool. |
| `/board/requests` | Tools you asked to borrow and their status. Open requests can be cancelled. |
| `/board/incoming` | Requests for your tools: approve, decline, mark returned. |
| `/admin` | Admins only: all loans and all members, with the Trusted Lender toggle. |

`/board` and `/admin` are protected in `proxy.ts`, so signed-out visitors are sent to sign in before the page loads. That is only a convenience; the Convex functions behind each page check access on their own.

### Loan rules

- A loan moves `requested` to `approved`, `declined` or `cancelled`, and `approved` to `returned`. Any other transition is refused.
- You cannot borrow your own tool, and you can have only one open request per tool.
- Dates must be valid, the start cannot be in the past, and a loan lasts at most 30 days.
- Requests and approvals that overlap an already approved loan for the same tool are refused, so a tool is never promised to two people for the same day.
- A tool counts as "on loan" from the start date of an approved loan until the lender marks it returned. An approved loan past its end date shows as overdue.
- Removing a listing cancels its open requests. Approved loans stay, since the tool may still be with the borrower.

## Tests

```bash
npm test
```

Runs the Convex function tests with `convex-test` and Vitest against an in-memory backend. The access tests sign in as different users and check that every forbidden action is refused, not only that allowed ones work.

## Roles and access control

Two roles: `admin` and `user`. Every rule is checked inside Convex functions with the helpers in `convex/access.ts`. The UI hides buttons a user cannot use, but that is only for convenience; the backend is the source of truth.

| Helper | Allows |
| --- | --- |
| `requireUser` | Any signed-in user that has a `users` row. |
| `requireAdmin` | Admins only. |
| `requireToolOwner` | Only the owner of the listing. Used for editing; admins cannot edit other people's listings. |
| `requireToolOwnerOrAdmin` | The owner or an admin. Used for removing a listing. |
| `requireLoanLender` | The owner of the borrowed tool. Used for approve, decline and mark returned. |
| `requireLoanBorrower` | The borrower. Used for cancelling a request. |
| `requireLoanParticipantOrAdmin` | Lender, borrower or admin. Used for reading a single loan. |

Identity always comes from the verified Clerk token (`ctx.auth.getUserIdentity()`), matched on `tokenIdentifier`. No function accepts a user id as proof of who the caller is. Errors are thrown as `ConvexError` with a code (`UNAUTHENTICATED`, `NO_ACCOUNT`, `FORBIDDEN`, `NOT_FOUND`) so the UI can show a clear message.

After sign-in the app calls `users.store`, which creates the user row on first visit and keeps name and email in sync with Clerk. New users always start as `user` with `trustedLender: false`.

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
- Signed-in users see each other's display name only. Email addresses are stored for notifications but never returned to the browser, not even to admins.
- The public tool list (`tools.listPublic`) returns only `name` and `category`. Owner, condition, description and document ids are dropped on the server, so they are never sent to signed-out visitors, not just hidden in the UI.
- Secrets live only in `.env.local` (git-ignored) and in the Convex deployment's environment variables.
