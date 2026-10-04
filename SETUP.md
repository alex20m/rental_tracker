# Setup

Standing up Rental Tracker from nothing: a Vercel project, a Neon Postgres
database added through Vercel, Neon Auth with email verification, and automatic
deploys from GitHub. Written so that **someone holding the tokens — or an agent —
can run it top to bottom without opening a browser**, except for the few steps
under [Has to be done by hand](#has-to-be-done-by-hand).

Roughly 30 minutes end to end, plus DNS time if you add a domain.

**Knowingly incomplete:**

- **The share email is best effort.** Sharing an apartment emails the invitee
  through Resend (see [Email](#email-resend)). If Resend is not configured or
  refuses, the invite still stands and the apartment appears when that person
  signs in with the invited email — the inviter just has to tell them.
- **Sharing depends on verified emails.** An invite is only handed to an
  account whose email Neon Auth has verified — otherwise anyone could sign up
  with someone else's address and claim it. Step 5 turns verification on; skip
  it and invites are never claimed.
- **The auth flow has not been exercised against a live Neon Auth project** by
  the change that introduced it; the sign-up → code → sign-in path was written
  against `@neondatabase/auth@0.5.0-beta`'s client API. Walk through it once on
  the first deployment (step 7).

## Email (Resend)

The invite email needs a Resend account, a **verified sending domain** (Resend
only delivers to arbitrary recipients from a verified domain), and an API key —
minting the key is the one step that needs a browser. Then:

```bash
npx vercel env add RESEND_API_KEY production,preview,development --value "re_..." --sensitive --yes
npx vercel env add MAIL_FROM production,preview,development --value "Rental Tracker <rentals@your-domain>" --yes
curl -s https://<your-app-url>/api/health   # "emailConfigured": true
```

Variables need a redeploy to take effect. Check delivery by sharing an
apartment with an address you can read.

## Prerequisites

| You need | For | Notes |
| --- | --- | --- |
| The GitHub repository | Everything | Deploys come from its Git integration |
| A Vercel account + `VERCEL_TOKEN` | Hosting | Account Settings → Tokens |
| A Neon API key (`NEON_API_KEY`) | Auth configuration with `neonctl` | Must be able to see the Vercel-owned Neon project |

```bash
export VERCEL_TOKEN=...
export NEON_API_KEY=...
```

Never echo a token to check it is set — test it with a call that uses it
(`npx vercel whoami`, `npx neonctl projects list`). CLI versions this was
written against: `vercel@62.2.0`, `neonctl@7.0.6`.

## 1. The code

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run build
npx playwright install --with-deps chromium
npm run test:e2e                              # fails below 100 % UI coverage
```

All of these pass before any service exists — the unit tests use an in-process
Postgres and the end-to-end tests fake the API in the browser.

## 2. The hosting project

```bash
npx vercel link --yes --project rental-tracker
npx vercel project ls                         # rental-tracker is listed
```

Always pass `--project`: without it, `vercel link --yes` silently creates a new
project named after the directory.

## 3. The database

```bash
npx vercel integration add neon --name rental-tracker-db
npx vercel env ls                             # DATABASE_URL and DATABASE_URL_UNPOOLED present
npx vercel env pull .env.local
npm run migrate                               # "Applied 1 migration(s)."
```

From here on **every deployment migrates before it builds** (`vercel.json`:
`npm run migrate && next build`), so a failed migration fails the build and the
previous deployment keeps serving. Consequences:

- The database must be reachable for a deploy to succeed.
- Rolling a deployment back does **not** roll the schema back.
- Migrations must stay additive: the previous deployment is still serving while
  the next one migrates.

Check the tables exist:

```bash
psql "$(grep ^DATABASE_URL_UNPOOLED= .env.local | cut -d= -f2- | tr -d '"')" -c '\dt'
# apartments, apartment_owners, apartment_invites, rents, costs, receipts, pgmigrations
```

Receipt photos are stored in Postgres (`receipts.data`, compressed JPEGs of a
few hundred kB each) rather than in a separate blob store: one less service,
and access to a photo is decided by the same ownership check as everything
else. If storage grows beyond what the Neon plan allows, moving them to object
storage is a contained change in `lib/portfolio.ts` and the receipt route.

## 4. Your own variables

```bash
npx vercel env add APP_URL production,preview,development --value "https://<your-app-url>" --yes
npx vercel env pull .env.local
```

Environments are **comma-separated** (`vercel@62.2.0`): written with spaces,
the second word is taken as a git branch for a preview-only variable.

**Variables apply at build time.** Adding one without redeploying is the most
common "I set it and nothing happened".

## 5. Auth (Neon Auth)

Neon Auth is managed Better Auth: accounts live in the `neon_auth` schema of
the same database. It is *not* the older Stack Auth integration
(`@stackframe/stack`, `NEXT_PUBLIC_STACK_*`) that most tutorials describe.

Find the Neon project and its default branch, then enable auth:

```bash
PROJECT_ID=$(npx neonctl projects list --output json | jq -r '.projects[] | select(.name | test("rental-tracker")) | .id')
npx neonctl neon-auth enable --project-id "$PROJECT_ID" --branch main
npx neonctl neon-auth status --project-id "$PROJECT_ID" --branch main --output json   # read the base URL back
```

Require verified emails, with a code typed into the app rather than a link
(a code is a plain POST through the app's auth proxy; a link is a redirect, and
the session cookie can be lost on a redirect hop):

```bash
npx neonctl neon-auth config email-password update --project-id "$PROJECT_ID" --branch main \
  --enabled true \
  --require-email-verification true \
  --email-verification-method otp \
  --send-verification-email-on-sign-up false \
  --auto-sign-in-after-verification true
npx neonctl neon-auth config email-password get --project-id "$PROJECT_ID" --branch main
```

Neon is told **not** to send the code on sign-up because the app asks for it
itself, right after `signUp.email` (`components/SignIn.tsx`). With the
`send.otp` webhook below switched on, Neon's sign-up path neither sends its own
email nor calls the webhook — sign-up succeeds and no code exists. An explicit
`emailOtp.sendVerificationOtp` does call the webhook, so asking for it from the
app works whether the webhook is on or off. Deploy the app change **before**
turning this off, or sign-ups in between get no code.

Trust the deployed URL (otherwise emails point at localhost):

```bash
npx neonctl neon-auth domain add https://<your-app-url> --project-id "$PROJECT_ID" --branch main
```

Send the verification codes from your own sender instead of Neon's shared one
(by default the code arrives from Neon, under Neon's name). Neon Auth takes a
custom SMTP provider; Resend offers one, so the sender domain verified for the
share email in [Email](#email-resend) works here too — the username is the
literal `resend`, the password is the Resend API key:

```bash
npx neonctl neon-auth config email-provider update --project-id "$PROJECT_ID" --branch main \
  --type standard --host smtp.resend.com --port 465 \
  --username resend --password "re_..." \
  --sender-email "rentals@your-domain" --sender-name "Rental Tracker"
npx neonctl neon-auth config email-provider test --project-id "$PROJECT_ID" --branch main \
  --recipient-email you@example.com          # must arrive from the new sender
npx neonctl neon-auth config email-provider get --project-id "$PROJECT_ID" --branch main
```

This is per Neon branch, so repeat it for any branch whose sign-up emails should
carry the app's name (`--type shared` switches back to Neon's sender).

The sender must be on the **exact domain verified in Resend** — a subdomain such
as `rent.example.com` is refused (`550 This API key is not authorized to send
emails from ...`) unless that subdomain is verified too, and `MAIL_FROM` should
use the same address. `update` accepts a config that cannot send, which breaks
every sign-up, so always run the `test` and revert with `--type shared` if it
fails.

The header of Neon's emails shows the **Application Name**, which defaults to the
Neon project name (here `rental_tracker_db`). No `neonctl` flag sets it; the
API does, with the Neon API key from `.env.local`:

```bash
BRANCH_ID=$(npx neonctl neon-auth status --project-id "$PROJECT_ID" --branch main --output json | jq -r .branch_id)
curl -s -X PATCH "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$BRANCH_ID/auth/config" \
  -H "Authorization: Bearer $NEON_API_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"Rental Tracker"}'
```

Neon's own code email has fixed wording that the CLI cannot change. To control
it, subscribe the app to the `send.otp` webhook: Neon then skips its email and
posts the code to `/api/webhooks/neon-auth`, which sends it through Resend with
the wording in `lib/mail.ts` (next to the invite email). Order matters — with
the webhook on and the route not yet deployed, **every sign-up fails**, because
Neon no longer sends anything itself. So deploy first, then:

```bash
npx neonctl neon-auth config webhook update --project-id "$PROJECT_ID" --branch main \
  --enabled true --url https://<your-app-url>/api/webhooks/neon-auth --enabled-events send.otp
npx neonctl neon-auth config webhook get --project-id "$PROJECT_ID" --branch main
```

Then sign up with an address you can read: the code must arrive from the
`MAIL_FROM` sender. The route verifies Neon's Ed25519 signature against the
auth base URL's JWKS, so it needs `NEON_AUTH_BASE_URL` and the Resend variables
and nothing else. It answers 500 when it cannot send, so a misconfigured Resend
shows up as a failed sign-up rather than a silent one. To go back to Neon's
email: `webhook update --enabled false`.

Neon has no event log, test event or redelivery for webhooks, so Vercel's request
log for the route is the only evidence of what arrived: a 401 means the
signature did not verify, a 400 means it did but the event is not one the route
handles, a 500 means Resend refused. The URL must be HTTPS on a hostname with
no redirects, and a failing endpoint rejects the sign-up (fail-closed).

Set the two variables. The cookie secret is yours to generate and must be
**at least 32 characters** or the SDK throws:

```bash
npx vercel env add NEON_AUTH_BASE_URL production,preview,development --value "<base url from status>" --yes
npx vercel env add NEON_AUTH_COOKIE_SECRET production,preview,development --value "$(openssl rand -base64 32)" --yes
npx vercel env ls                             # both listed for all three environments
npx vercel env pull .env.local
```

Nothing in the code needs switching on: `lib/auth.ts` uses Neon Auth as soon as
both variables exist, and treats every request as signed out until then.

## 6. Deploys

Connect the repository to the Vercel project and leave automatic deploys **on**:

```bash
npx vercel git connect https://github.com/alex20m/rental_tracker
```

Every pull request gets a preview; every merge to `main` goes to production.
Nothing in `.github/workflows/` deploys or migrates, and `tests/pipeline.test.ts`
fails if that changes.

## 7. Prove it end to end

```bash
curl https://<your-app>/api/health
# {"ok":true,"databaseConfigured":true,"appUrlConfigured":true,"authConfigured":true}
```

Then once, by hand, in a browser (this is the part no test covers):

1. Create an account → a code arrives by email → enter it → you land on
   **Portfolio**.
2. Add two apartments. Open one → gear → share it with a second email at 30 %.
3. Sign up with that second email and verify it. Its Portfolio shows **only**
   the shared apartment, at 30 %; the first account shows 70 %.
4. Change shares, log a rent month and a cost, and generate the declaration zip
   from both accounts: each PDF shows its own share.

## 8. A custom domain (optional)

```bash
npx vercel domains add <domain> rental-tracker
npx vercel domains inspect <domain>           # the record Vercel wants
npx vercel domains verify <domain>
```

DNS at Cloudflare: create the record through its API with `"proxied": false` —
an orange-clouded record breaks certificate issuance. Then add the new origin
to Neon Auth's trusted domains (step 5) and update `APP_URL`.

## Has to be done by hand

- **Minting `VERCEL_TOKEN` and `NEON_API_KEY`.** The credentials every CLI needs
  cannot be created by one.
- **Billing and accepting integration terms** (`vercel integration add neon` may
  ask for a one-time terms acceptance in a browser).

## Environment variables

| Name | What it is | Who supplies it |
| --- | --- | --- |
| `DATABASE_URL` | Pooled connection, for app queries | The Neon integration |
| `DATABASE_URL_UNPOOLED` | Direct connection, for migrations | The Neon integration |
| `NEON_AUTH_BASE_URL` | Neon Auth endpoint for this branch | Read from `neon-auth status`, set by you |
| `NEON_AUTH_COOKIE_SECRET` | Signs the session cookie, ≥ 32 chars | You generate it |
| `APP_URL` | Where the app is served | You |
| `RESEND_API_KEY` | Sends the share email | You (Resend) |
| `MAIL_FROM` | Sender of the share email, e.g. `Rental Tracker <rentals@your-domain>` | You |

Provider-managed variables rotate on their own; never copy one into a second
place.

## Checklist

- [ ] `npm run lint && npm run typecheck && npm test && npm run build` passes locally
- [ ] Vercel project created and linked
- [ ] Neon added through Vercel; `DATABASE_URL` visible in `vercel env ls`
- [ ] `npm run migrate` applied; the seven tables exist
- [ ] Neon Auth enabled, email verification required with OTP, deployed URL trusted,
      custom SMTP sender tested (`email-provider test`),
      `send.otp` webhook enabled after the deploy, and a real sign-up code received
- [ ] Neon Auth sends from the app's own sender (`email-provider test` arrived from it)
- [ ] `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `APP_URL` set for production, preview, development
- [ ] Git integration connected with automatic deploys on
- [ ] `/api/health` reports everything `true`
- [ ] The step 7 walk-through done once

## Troubleshooting

**`DATABASE_URL is not set`** — `npx vercel env pull .env.local`, after the
integration was added.

**`/api/health` says `authConfigured: false` on a deployment** — the variables
exist but the deployment predates them. Redeploy.

**Every page sends me to /sign-in, and signing in says "Auth is not
configured"** — the same: auth variables missing from that deployment.

**Signing up works but no code ever arrives** — with the `send.otp` webhook on,
Neon sends nothing itself, so any failure in `/api/webhooks/neon-auth` means no
email, and the sign-up page can still look successful. Read the deployment's
runtime logs (`npx vercel logs <deployment-url>`) for the line it writes:
*signature did not verify* (check `NEON_AUTH_BASE_URL` is this branch's base
URL), *RESEND_API_KEY and MAIL_FROM must both be set* (`/api/health` →
`emailConfigured`; redeploy after setting them), or *Resend refused … 403* with
Resend's reason (sender domain not verified). No log line at all means Neon is
not reaching the route: `neonctl neon-auth config webhook get` must show it
enabled with the deployed URL (a Vercel preview behind deployment protection
answers 401 to Neon). To get codes flowing again at once, switch back to Neon's
own email: `neonctl neon-auth config webhook update --enabled false`.

**A shared apartment never shows up for the other owner** — they are signed in
with a different email than the one invited, or their email is not verified
(the Home screen says so and links to verification). Check
`neon-auth config email-password get` has `require_email_verification` on.

**A preview deployment has no data and no accounts** — expected: a preview gets
its own database branch, with the schema but not the rows, and Neon Auth users
live in that branch too.

**The build fails in the migration step** — read the migration, not the build.
The previous deployment is still serving, which is the intended behaviour.
