# @rawura/emails

Every transactional email the platform sends: templates, payload types, subject lines,
plain-text bodies, branding and the SMTP transport.

Consumed by `Main-server` and `event-bus` as a git dependency:

```json
"@rawura/emails": "github:OEPlast/emails#semver:^1.0.0"
```

Neither service owns templates or a renderer of its own — that arrangement is what let the
two copies drift until event-bus was sending logoless order confirmations with different
subject lines from Main-server's copy of the same file.

**Setup, releasing and CI/Docker: see [PUBLISHING.md](./PUBLISHING.md).** The
`OEPlast/emails` repo must exist and be tagged before either service can `npm install`.

For day-to-day work, run `./link-shared-emails.sh` from the repo root to point both services
at this working copy without touching their `package.json` or lockfiles.

## Sending

```ts
import EmailProcessor from '@/services/processor/EmailProcessor';

await EmailProcessor.send('order-shipped', {
  email, firstName, orderId, orderNumber, purchaseDate,
  trackingNumber, orderStatus: 'Shipped', shipping, products,
  manageOrderLink,
});
```

The kind is checked against its payload type at compile time, so a template cannot be handed
data it does not render. `send()` never throws — it logs the kind and recipient and returns
`false`, so a mail failure cannot roll back the operation that triggered it.

## Adding an email

1. Add the payload interface and a `EmailPayloadMap` entry in `src/types.ts`.
2. Add `src/templates/<kind>.html`, opening with `{{> head title="…"}}` and closing with
   `{{> foot}}`.
3. Add a subject in `src/subjects.ts` and a plain-text body in `src/text.ts` — both registries
   are exhaustive over `EmailKind`, so TypeScript will tell you what is missing.
4. Add a preheader in `src/build.ts` and a fixture in `scripts/fixtures.ts`.
5. `npm run preview`.

Classify the email in `MARKETING_KINDS` (`src/subjects.ts`). Marketing mail gets an
unsubscribe link, `List-Unsubscribe` headers, and is suppressed for opted-out recipients;
transactional mail gets none of that and always sends.

## Preview harness

```
npm --prefix shared/emails run preview
```

Renders all 18 emails plus 10 edge-case variants (pickup order, GIG order with waybill,
missing product image, no first name, zero discount, 20-item basket, each return status) to
`preview/`, and **fails** if any output contains `undefined`, `null`, `NaN`,
`[object Object]`, an unrendered `{{…}}`, an `href="#"`, or a stale hardcoded domain.

That assertion is the point. Every bug this package was written to fix — `{{invoiceNumber}}`
against a payload with no such field, `order.orderNumber` against a schema with no such
column, `description_images[0]` indexed as a string against an array of objects — is
invisible in review and obvious in rendered output.

Open `preview/index.html`, narrow the window to 320px for the phone layout, and switch your
OS to dark mode for the dark palette.

## Environment

| Variable | Purpose | Fallback |
|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Transport | port 587 |
| `SMTP_SECURE` | `'true'` for implicit TLS | `false` |
| `FROM_EMAIL` | Envelope sender | `supportEmail` |
| `STOREFRONT_URL` → `FRONTEND_URL` | Base for customer links | `https://www.rawura.com` |
| `PUBLIC_API_URL` → `API_URL` | Base for the unsubscribe endpoint | none — link is omitted |
| `CDN_BASE_URL` | Product images | `https://oeptest.b-cdn.net/` |
| `STORE_NAME`, `COMPANY_NAME`, `STORE_LOGO_URL`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `STORE_ADDRESS`, `STORE_CITY`, `STORE_STATE`, `STORE_COUNTRY` | Brand fallbacks when the `Settings` document is empty or unreachable | see `src/branding.ts` |
| `EMAIL_TEMPLATE_NO_CACHE=1` | Recompile templates on every render while iterating | off |

Brand values come from the store `Settings` document first: Main-server reads it directly,
event-bus fetches it from `GET /api/internal/branding`. The environment variables above are
the fallback, so a missing or unreachable `Settings` degrades to generic branding rather than
to a blank header.

## Layout

Templates are mobile-first: base CSS is the phone layout, `@media (min-width: 600px)` widens
it. Do not reintroduce a second `max-width` breakpoint system — the originals had both, and
they fought each other. Dark mode is a real `prefers-color-scheme` block, not just the
`color-scheme` declaration. Use `{{> button}}` for calls to action; it carries the VML
fallback Outlook needs.
