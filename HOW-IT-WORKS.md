# How the email package works

Three things this explains:

1. [**Which file sends which email**](#1-which-file-sends-which-email) — how `'order-shipped'` finds `order-shipped.html`
2. [**The type definitions**](#2-the-type-definitions) — what they enforce and what they can't
3. [**Versions**](#3-versions) — how a service knows which copy of the package to install
4. [**Dev linking**](#4-dev-linking) — how you edit templates without publishing

---

## 1. Which file sends which email

### The one rule

**The kind string is the filename.** There is no lookup table, no config, no registry mapping
names to files. `'order-shipped'` loads `order-shipped.html` because of string concatenation.

```ts
await EmailProcessor.send('order-shipped', payload);
```

Follow it down:

| Step | File | What happens |
|---|---|---|
| 1 | your service | `EmailProcessor.send('order-shipped', payload)` |
| 2 | `src/mailer.ts` | checks consent, then calls `buildEmail(kind, data, brand)` |
| 3 | `src/build.ts` | `renderEmailTemplate(kind, { ...data, brand, links })` |
| 4 | `src/engine.ts` | `path.join(TEMPLATE_DIR, kind + '.html')` |
| 5 | disk | `dist/src/templates/order-shipped.html` |

The line that does it, [`src/engine.ts:89`](src/engine.ts):

```ts
const templatePath = path.join(TEMPLATE_DIR, `${templateName}.html`);
```

So **to find the file for an email you are looking at, take the kind and add `.html`.** To
find the kind for a file, drop the `.html`.

### Where TEMPLATE_DIR points

```ts
const TEMPLATE_DIR = path.join(__dirname, 'templates');
```

`__dirname` is wherever the compiled `engine.js` sits, so it differs by context:

| Context | Resolves to |
|---|---|
| Installed in a service | `<service>/node_modules/@rawura/emails/dist/src/templates/` |
| Running the preview harness | `shared/emails/dist/src/templates/` |

This is why **templates are read from `node_modules` at runtime**, not bundled into your
service's `dist/`. Delete `node_modules` after building and the service starts fine, then
throws `Email template not found` on the first order.

### Five things share the kind

Adding an email means adding it in five places, all keyed by the same string:

```
                         'order-shipped'
                               │
        ┌──────────────┬───────┴───────┬──────────────┬──────────────┐
        ▼              ▼               ▼              ▼              ▼
  EmailPayloadMap   subjects.ts     text.ts     PREHEADERS    templates/
   (types.ts)        registry       registry     (build.ts)   order-shipped.html
   payload shape    subject line   plain text   inbox preview   HTML body
        │              │               │              │              │
        └──── TypeScript enforces these four ─────────┘         not checked
                                                            by the compiler ──┐
                                                                              ▼
                                                                     preview harness
```

The first four are exhaustive TypeScript records — miss one and the build fails naming it.
The fifth is a file on disk, which the compiler cannot see. That gap is covered by the
preview harness (§2).

### Finding things quickly

```bash
# What does the shipped email actually say?
shared/emails/src/templates/order-shipped.html      # HTML body
shared/emails/src/text.ts                           # plain-text body ('order-shipped' key)
shared/emails/src/subjects.ts                       # subject line

# Which templates exist?
ls shared/emails/src/templates/*.html

# Which code sends this email?
grep -rn "send('order-shipped'\|send(\"order-shipped\"" ../../Main-server/src ../../event-bus/src
```

Shared chunks (header, footer, button, product list, shipping block) live in
`src/templates/partials/*.hbs` and are pulled in with `{{> name}}`. Editing
`partials/foot.hbs` changes the footer of all 18 emails at once.

---

## 2. The type definitions

### The registry

Everything derives from one interface in [`src/types.ts`](src/types.ts):

```ts
export interface EmailPayloadMap {
  'verification-email': VerificationEmailData;
  'order-confirmation': OrderConfirmationData;
  'order-shipped':      OrderShippedData;
  // …18 total
}

export type EmailKind = keyof EmailPayloadMap;
```

`EmailKind` is a **union of literal strings** — `'verification-email' | 'order-confirmation' |
…` — not `string`. That's what makes the rest work.

### How send() gets checked

```ts
async send<K extends EmailKind>(kind: K, data: EmailPayloadMap[K]): Promise<boolean>
```

`K` is inferred from the first argument, which pins the second. Pass `'order-shipped'` and
TypeScript demands exactly `OrderShippedData`:

```ts
EmailProcessor.send('order-shipped', { email, orderNumber });
//                                   ~~~~~~~~~~~~~~~~~~~~~~
// Missing: trackingNumber, orderStatus, shipping, products,
//          manageOrderLink, orderId, purchaseDate

EmailProcessor.send('order-shiped', …);
//                  ~~~~~~~~~~~~~~ not assignable to EmailKind
```

Your editor autocompletes all 18 kinds after typing the opening quote.

### Why the closed interfaces matter

`EmailUser` deliberately does **not** extend `Record<string, unknown>`:

```ts
export interface EmailUser {
  firstName?: string;
  lastName?: string;
  email: string;
}
```

The old Main-server copy did extend it. An index signature makes *any* property access legal,
which is how `data.invoiceNumber` — a field that never existed on any payload — compiled
cleanly and shipped `Order Confirmation - undefined` to customers. Keeping these closed turns
that class of mistake into a build error. **Don't add an index signature back.**

### The exhaustive registries

Three files use mapped types over `EmailKind`, so all 18 keys are mandatory:

```ts
// subjects.ts
type SubjectRegistry = { [K in EmailKind]: SubjectBuilder<K> };

// text.ts
type TextRegistry = { [K in EmailKind]: TextBuilder<K> };

// build.ts
const PREHEADERS: Record<EmailKind, string> = { … };
```

Add a kind to `EmailPayloadMap` and the build fails three times, each naming the missing key.
You cannot forget a subject or a plain-text body.

### What types cannot catch

**A missing or misnamed template file.** `EmailKind` is a TypeScript union; the templates are
files. Nothing connects them at compile time — a typo in a filename builds fine and throws at
runtime, in front of a customer.

That is what the preview harness is for:

```bash
npm --prefix shared/emails run preview
```

It renders every kind and fails on:

- a kind in the map with no template file
- a template file with no fixture (so nobody has ever seen it rendered)
- output containing `undefined`, `null`, `NaN`, `[object Object]`, an unrendered `{{…}}`, a
  dead `href="#"`, or a stale hardcoded domain

Templates are also **not type-checked against their payloads**. `{{trackingNumber}}` in a
template whose payload has no `trackingNumber` renders empty, silently. Handlebars has no
types. The harness catches this by scanning rendered output — which is exactly how the
original `{{invoiceNumber}}` and `{{shipping.receiptNumber}}` bugs would have been caught.

### Where types come from when installed

Your service does not read `src/types.ts`. It reads generated declarations:

```
package.json  →  "types": "dist/src/index.d.ts"
```

`tsc` emits a `.d.ts` beside every `.js` (`declaration: true`). `src/index.ts` deliberately
does **not** re-export `./types` or `./branding`. Services own their brand (Main-server's
`src/services/brand`) and keep their own copy of the payload types (`src/types/emailPayloads.ts`),
and they import only `Mailer` from this package. The package's `EmailBrand` and payload
interfaces only describe what its templates render. TypeScript checks a service's own types
against them structurally at `Mailer`'s `getBrand` and `send(kind, data)`, so drift is still a
compile error.

**If your editor shows stale types after editing the package, you haven't rebuilt.** Run
`npm --prefix shared/emails run build`, then restart the TS server in VS Code
(`Ctrl+Shift+P` → "TypeScript: Restart TS Server").

---

## 3. Versions

### Git tags are the versions

There is no npm registry. The dependency is a git URL:

```json
"@rawura/emails": "github:OEPlast/emails#semver:^1.0.0"
```

Read as: *the repo `OEPlast/emails`, at the highest git tag satisfying `^1.0.0`.*

On install, npm:

1. lists the repo's tags
2. discards any that aren't valid semver (a leading `v` is allowed and stripped)
3. picks the highest one matching the range
4. **records that tag's commit SHA in `package-lock.json`**

Step 4 is the important one. The range chooses; the lockfile *pins*.

```
package.json     ^1.0.0          "anything 1.x, at least 1.0.0"
     │
     ▼
git tags         v1.0.0  v1.0.1  v1.1.0  v2.0.0
                                   ▲               ✗ 2.x excluded by ^1
                                   │
                              highest match
     │
     ▼
package-lock     #a1b2c3d…        an exact commit — this is what installs
```

Two people running `npm ci` a month apart get byte-identical code, even if new tags appeared
in between. Nothing changes until someone runs `npm update` and commits the new lockfile.

### What `^1.0.0` allows

| Tag | Matches `^1.0.0`? | Meaning |
|---|---|---|
| `v1.0.1` | yes | patch — wording, styling, a fix |
| `v1.4.0` | yes | minor — a new email, a new optional field |
| `v2.0.0` | **no** | major — a renamed or removed field; needs a deliberate bump |

So a breaking change can't reach your services by accident, but you must remember to widen
the range when you do want it.

### Releasing

```bash
cd shared/emails
npm version patch          # 1.0.1 -> 1.0.2, commits, creates tag v1.0.2
git push --follow-tags     # --follow-tags pushes the tag too. Without it, npm sees nothing.
```

`npm version` bumps `package.json`, commits, and tags in one step — which is why the tag and
the version in the file can never disagree.

Then pull it into each service *separately*:

```bash
cd ../Main-server && npm update @rawura/emails
git add package-lock.json && git commit -m "emails 1.0.2" && git push
```

**Nothing reaches customers until a service's lockfile moves.** A template edit can't silently
change what a service sends mid-deploy of something else.

### What actually ships

`dist/` is **gitignored** — the repo has no built output. Instead:

```json
"scripts": { "prepare": "npm run build" },
"files": ["dist"]
```

- `prepare` runs **automatically** after npm clones the package. You never run it yourself.
- `files` whitelists what gets packed: only `dist/`.
- `.npmignore` exists solely so packing rules aren't inherited from `.gitignore` — which
  ignores `dist/`, the one directory that must ship. Without it you get a package that
  installs cleanly and throws `Email template not found` on the first send.

Committing `dist/` instead would guarantee it goes stale the first time someone edits source
and forgets to rebuild.

### Checking what a service has

```bash
# The range it asks for
node -p "require('./package.json').dependencies['@rawura/emails']"

# The exact commit it actually installed
node -p "require('./package-lock.json').packages['node_modules/@rawura/emails'].resolved"

# The version currently on disk
node -p "require('@rawura/emails/package.json').version"

# Templates present (expect 18)
node -e "console.log(require('@rawura/emails').getAvailableTemplates().length)"
```

If the last two disagree with what you expect, you are running an older commit than you think.

---

## 4. Dev linking

### The problem

In production the services install from a git tag. So editing `shared/emails` locally changes
nothing for them until you commit, tag, push and `npm update` — far too slow for tweaking a
template.

### What the script does

```bash
./link-shared-emails.sh
```

It replaces the installed copy with a symlink to your working directory:

```
BEFORE                                    AFTER

Main-server/node_modules/                 Main-server/node_modules/
  @rawura/emails/          ← a real         @rawura/emails ─────┐  ← a symlink
    dist/                    copy from                          │
      src/templates/         the git tag                        │
                                                                ▼
                                                    shared/emails/
                                                      dist/src/templates/  ← you edit here
```

Node resolves symlinks to their real path, so `require('@rawura/emails')` loads
`shared/emails/dist/...` and its dependencies resolve from `shared/emails/node_modules/`.
Edits are live immediately.

### Why not `npm link`

`npm link <pkg>` re-resolves the consumer's **entire** dependency tree — all ~700 packages —
and can move or reinstall ones unrelated to this change. The script writes the one symlink
directly instead: ~5 seconds, and nothing else in `node_modules` is touched.

It also **never modifies `package.json` or `package-lock.json`**, so there is nothing you
could accidentally commit. Production is unaffected by whether you have linked or not.

### When to re-run it

**After any `npm install` in a service.** npm install rebuilds `node_modules` from the
lockfile and overwrites the symlink with the real package.

> Edited a template and nothing changed? This is the cause about nine times in ten.

### The dev loop

```bash
./link-shared-emails.sh                          # once, and after any npm install

# editing .ts (types, subjects, text, engine):
npm --prefix shared/emails run build             # then restart the service

# editing .html / .hbs only:
#   start the service with EMAIL_TEMPLATE_NO_CACHE=1 and templates are
#   re-read on every send — no rebuild, no restart

npm --prefix shared/emails run preview           # see all 18 in a browser
```

Without `EMAIL_TEMPLATE_NO_CACHE=1`, templates are compiled once and cached for the process
lifetime — an order confirmation shouldn't re-read and re-compile 300 lines of HTML on the
payment webhook path.

### Going back

```bash
./link-shared-emails.sh --unlink
cd Main-server && npm install     # restores the real dependency from the lockfile
```

### Verifying which mode you're in

```bash
node -e "const fs=require('fs');const p='Main-server/node_modules/@rawura/emails';
console.log(fs.lstatSync(p).isSymbolicLink() ? 'LINKED -> '+fs.readlinkSync(p) : 'installed copy')"
```

---

## Quick reference

| Question | Answer |
|---|---|
| Which file sends email X? | `src/templates/<kind>.html` — kind and filename are the same string |
| Where's the subject? | `src/subjects.ts`, keyed by kind |
| Where's the plain-text version? | `src/text.ts`, keyed by kind |
| Where's the footer / header / button? | `src/templates/partials/` — shared by all 18 |
| What fields does an email need? | `EmailPayloadMap` in `src/types.ts` |
| Which version is installed? | `node -p "require('@rawura/emails/package.json').version"` |
| Why didn't my edit show up? | Re-run `./link-shared-emails.sh`, then rebuild |
| How do I ship a change? | `npm version patch && git push --follow-tags`, then `npm update` per service |

Setup and deployment: [`../../EMAIL-PACKAGE-SETUP.md`](../../EMAIL-PACKAGE-SETUP.md).
Release runbook and CI: [`PUBLISHING.md`](PUBLISHING.md).
