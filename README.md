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

## Automation with n8n

n8n runs locally in Docker (`n8n/docker-compose.yml`) next to a small Caddy gateway. Exported workflows live in `n8n/workflows/`.

### Setup

1. Create `n8n/.env` from `n8n/.env.example`. Generate both secrets with `openssl rand -hex 32`.
2. Give Convex the same shared secret:

   ```bash
   npx convex env set LENDLOOP_WEBHOOK_SECRET <same value as in n8n/.env>
   ```

3. Start n8n and load the workflows:

   ```bash
   npm run n8n:up
   npm run n8n:import
   ```

   The editor is at http://localhost:5678 (create the owner account on first visit).

4. Convex runs in the cloud, so it needs a public URL to reach your local n8n. For development, a Cloudflare quick tunnel is enough and needs no account:

   ```bash
   cloudflared tunnel --url http://127.0.0.1:5680
   npx convex env set N8N_LOAN_EVENT_WEBHOOK_URL https://<random>.trycloudflare.com/webhook/lendloop-loan-event
   ```

   The tunnel points at the gateway on port 5680, not at n8n itself. The gateway only forwards `/webhook/*` and answers 404 for everything else, so the n8n editor and REST API are never exposed. A quick tunnel gets a new URL each time it starts, so set the env var again after restarting it.

### Workflow 1: loan request notification

`n8n/workflows/loan-request-notification.json`

```
Convex mutation ──schedules──> deliver action ──signed POST──> tunnel ──> gateway ──> n8n webhook
                                     │                                                    │
                                     └── automationEvents (sent / failed) <── 2xx or error ┘
```

1. Every loan transition (`requested`, `approved`, `declined`, `cancelled_by_borrower`, `listing_removed`, `returned`) schedules `notifications.deliver` from inside the same mutation, so the notification is only queued if the change itself commits.
2. The action builds a minimal payload: event, the recipient's name and email, the other person's display name, tool name, dates and status. The other person's email is never included.
3. The body is signed with HMAC-SHA256 over `<timestamp>.<raw body>` and sent with `X-LendLoop-Timestamp` and `X-LendLoop-Signature` headers.
4. In n8n, the first node after the webhook recomputes the signature over the raw request bytes, compares it in constant time and rejects anything older than five minutes. Invalid requests get a 401 and go no further.
5. A dedupe step remembers handled `eventId`s for seven days, so a retried delivery is acknowledged without notifying anyone twice.
6. The notification itself is a mock: n8n composes the message and records it in the execution log with the email address masked (`o***@example.com`). Swapping in an Email or Slack node is a one-node change.

### Workflow 2: daily overdue reminders

`n8n/workflows/daily-overdue-reminders.json`

```
08:00 schedule ──> sign {date} ──> POST /n8n/overdue-loans ──> one item per loan ──> mock reminder ──> sign ──> POST /n8n/reminder-status
```

1. A Schedule Trigger runs every day at 08:00 (Europe/Zagreb). There is also a manual trigger for testing.
2. n8n signs `{"date": "YYYY-MM-DD"}` with the shared secret and posts it to the Convex HTTP action `/n8n/overdue-loans` (`convex/http.ts`). Convex verifies the signature and timestamp, accepts only a date within a day of its own clock, and returns approved loans whose end date has passed. Each entry has the borrower's name and email, the lender's name, the tool, the due date, days overdue and a `reminderKey`. Loans already reminded today are left out.
3. For each loan n8n composes a reminder and logs it with the email masked, then signs `{loanId, date, outcome, detail}` and posts it to `/n8n/reminder-status`.
4. Convex writes the status into `automationEvents` under the key `reminder:<loanId>:<date>`. A retry or a second run on the same day finds the existing row and changes nothing (a `failed` row can be upgraded to `sent`, never the reverse). The endpoint answers `{created: true}` the first time and `{created: false}` after that.

Both HTTP Request nodes retry three times, five seconds apart. Convex rejects unsigned, wrongly signed or stale requests with 401 and malformed bodies with 400.

To try it without waiting for 08:00, create an overdue loan and run the workflow once:

```bash
npx convex run seed:overdueDemo '{"borrowerEmail":"you@example.com"}'
docker compose -f n8n/docker-compose.yml exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=lendloopOverdue01
```

### Workflow 3: error handler

`n8n/workflows/error-handler.json`

Both workflows above name this one as their error workflow, so any failed run (a node throwing, Convex unreachable after all retries, a bad payload) starts it. It summarizes the failure (workflow, failed node, execution id, error message with any email address replaced by `[email]`), signs it and posts it to the Convex HTTP action `/n8n/workflow-error`. Convex stores it in `integrationFailures`, keyed by execution id so a retried report is stored once.

The admin page has an "Automation problems" list that merges these n8n failures with failed deliveries recorded by Convex itself, so a broken integration shows up in the app and not only in a log nobody reads.

### Retries and failures

Delivery is retried from Convex on network errors, timeouts, 429 and 5xx responses (after 30 s, 2 min and 10 min). A 4xx such as a rejected signature is not retried, since retrying cannot fix it. Every final outcome, success or failure, is written to `automationEvents` under a unique idempotency key, so failures are visible instead of silent.

## Tests

```bash
npm test
```

Runs the Convex function tests with `convex-test` and Vitest against an in-memory backend. The access tests sign in as different users and check that every forbidden action is refused, not only that allowed ones work. The notification tests mock `fetch` and check the signature, the payload fields, retries, the no-retry case for 4xx, and that each event is recorded exactly once. The reminder tests call the HTTP actions with signed, unsigned, wrongly signed and replayed requests, and check that the write-back is idempotent. The health tests cover the error report endpoint and check that only admins can read the problem list.

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
| `integrationFailures` | Failed n8n runs reported by the error workflow, one row per execution. |

## How auth works

- Clerk handles sign-in. `proxy.ts` runs Clerk's middleware on every request (Next.js 16 renamed `middleware.ts` to `proxy.ts`).
- `ConvexProviderWithClerk` asks Clerk for a token from the `convex` JWT template and sends it with every Convex request.
- `convex/auth.config.ts` tells Convex to accept only tokens issued by our Clerk instance (`CLERK_JWT_ISSUER_DOMAIN`) with audience `convex`. Inside Convex functions the user comes from `ctx.auth.getUserIdentity()`, never from a client argument.

## Security and data minimization

- The `convex` JWT template carries only `aud`, `name` and `email`. Nothing else from the Clerk profile reaches the backend.
- Signed-in users see each other's display name only. Email addresses are stored for notifications but never returned to the browser, not even to admins.
- The public tool list (`tools.listPublic`) returns only `name` and `category`. Owner, condition, description and document ids are dropped on the server, so they are never sent to signed-out visitors, not just hidden in the UI.
- Secrets live only in `.env.local` and `n8n/.env` (both git-ignored) and in the Convex deployment's environment variables. The exported workflow JSON reads the HMAC secret through `$env` and contains no secret values.
- Webhooks are signed with HMAC-SHA256 and a timestamp, verified in constant time, and rejected after five minutes to limit replays.
- Only the n8n webhook path is reachable from outside; the editor stays on localhost.
