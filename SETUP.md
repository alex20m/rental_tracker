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
  --send-verification-email-on-sign-up true \
  --auto-sign-in-after-verification true
npx neonctl neon-auth config email-password get --project-id "$PROJECT_ID" --branch main
```

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

Send the sign-up codes from your own address instead of Neon's shared
`auth@mail.myneon.app`, through Resend's SMTP. Use the same verified domain as
`MAIL_FROM` — Resend verifies each domain separately, so a sender on a
subdomain (`rent.example.com`) is rejected unless that subdomain is verified
too (`550 This API key is not authorized to send emails from ...`). The SMTP
password is the Resend API key:

```bash
npx neonctl neon-auth config email-provider update --project-id "$PROJECT_ID" --branch main \
  --type standard --host smtp.resend.com --port 465 --username resend \
  --password "$RESEND_API_KEY" \
  --sender-email rentals@your-domain --sender-name "Rental Tracker"
npx neonctl neon-auth config email-provider test --project-id "$PROJECT_ID" --branch main \
  --recipient-email <an address you can read>
```

Run the `test` — a saved config that cannot send breaks every sign-up, and
`update` accepts it without checking. If it fails, put the provider back with
`--type shared`.

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
      custom SMTP sender tested (`email-provider test`)
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

**A shared apartment never shows up for the other owner** — they are signed in
with a different email than the one invited, or their email is not verified
(the Home screen says so and links to verification). Check
`neon-auth config email-password get` has `require_email_verification` on.

**A preview deployment has no data and no accounts** — expected: a preview gets
its own database branch, with the schema but not the rows, and Neon Auth users
live in that branch too.

**The build fails in the migration step** — read the migration, not the build.
The previous deployment is still serving, which is the intended behaviour.
