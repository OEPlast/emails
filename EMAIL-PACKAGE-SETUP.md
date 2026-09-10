# Setting up the shared email package — step by step

Follow this top to bottom. Every step has a **✓ Check** so you know it worked before moving on.

**Time:** about 10 minutes. **You need:** git, Node 18+ (you have v24.16.0), and permission to
create a repo in the `OEPlast` GitHub org.

> This guide assumes the `emails` repo is **public**, which is what you chose. That means no
> tokens, no deploy keys, and no server configuration anywhere. Nothing in the package is
> sensitive — it was scanned before publishing (see Part 6).

---

## Part 0 — What you are doing, in plain terms

All of the email code lives in `shared/emails/`. Right now that folder is **not inside any git
repository** — `Main-server`, `event-bus` and `storefront` are three separate repos, and
`shared/` sits outside all of them, at a folder with no `.git`.

That means the email code exists only on your laptop. It works locally because npm made a
shortcut (a symlink) from each service into that folder. On a server there is no such folder,
so `npm install` fails.

The fix: give `shared/emails` its own GitHub repo. Then both services install it the same way
they install `express` — by name, from the internet.

```
        TODAY                                  AFTER

  Main-server ──┐                     Main-server ──┐
                ├─> shared/emails                   ├─> github.com/OEPlast/emails
  event-bus  ───┘    (on your laptop    event-bus ──┘        (a real repo)
                      only — invisible
                      to any server)
```

Nothing about how the emails work changes. This is purely about *where the code lives* so a
server can find it.

---

## Part 1 — Create the package repo

### Step 1 — Make an empty repo on GitHub

Go to <https://github.com/organizations/OEPlast/repositories/new> and create:

- **Name:** `emails`
- **Visibility:** **Public**
- **Do NOT tick** "Add a README file", "Add .gitignore", or "Choose a license"

It must be completely empty. If GitHub adds a README, the push in Step 2 is rejected.

**✓ Check:** the page says *"Quick setup — if you've done this kind of thing before"*. That
means the repo is empty and ready.

---

### Step 2 — Push the code into it

Open a terminal at the project root (`c:\Users\ot\Desktop\WF\Rawura`) and run these one at a
time:

```bash
cd shared/emails
git init
git add .
git commit -m "Shared transactional email package"
git branch -M main
git remote add origin https://github.com/OEPlast/emails.git
git push -u origin main
```

If it asks for a username and password, use your GitHub username and a **Personal Access
Token** as the password (GitHub stopped accepting account passwords). Make one at
<https://github.com/settings/tokens>. This is only for *you* to push — servers will not need
one, because the repo is public.

**✓ Check:** refresh the repo page on GitHub. You should see `src/`, `scripts/`,
`package.json`, `README.md`. You should **not** see a `dist/` folder — that is correct and
intentional (explained in Part 5).

---

### Step 3 — Tag version 1.0.0

```bash
git tag v1.0.0
git push origin v1.0.0
```

**Why this matters:** both services ask for `#semver:^1.0.0`. They look for *tags*, not
commits. Without a tag, npm finds nothing and the install fails — even though the code is
clearly there on GitHub. This is the single most common thing to forget.

**✓ Check:** the GitHub repo page shows **"1 tag"** near the top left, next to "1 branch".

---

### Step 4 — Connect the services

Back at the project root:

```bash
cd ../../Main-server
npm install

cd ../event-bus
npm install
```

This downloads the package from GitHub, builds it, and records the exact commit in each
`package-lock.json`.

**✓ Check:** run this in `event-bus` — it should print `18`:

```bash
node -e "console.log(require('@rawura/emails').getAvailableTemplates().length)"
```

Now commit the updated lockfiles, in each service repo separately:

```bash
git add package.json package-lock.json
git commit -m "Install @rawura/emails from git"
git push
```

**Setup is done.** There is nothing to configure on any server.

---

## Part 2 — Daily development

**Run this once now, and again after any `npm install`:**

```bash
cd c:/Users/ot/Desktop/WF/Rawura
./link-shared-emails.sh
```

This points both services back at your local `shared/emails` folder, so you can edit templates
and see the change immediately without pushing anything to GitHub.

It uses `npm link`, which does **not** change `package.json` or the lockfiles — so there is
nothing you could accidentally commit.

**✓ Check:** it ends with `Linked. Both services now read shared/emails directly.`

### Why you must re-run it

`npm install` in a service throws the link away and reinstalls the real package from GitHub.
If you edit a template and nothing changes, this is almost always why. Just run the script
again.

### After editing the package

```bash
npm --prefix shared/emails run build
```

**Exception:** if you only edited an `.html` or `.hbs` file, start the service with
`EMAIL_TEMPLATE_NO_CACHE=1` and templates are re-read on every send — no rebuild, no restart.

### Previewing your changes

```bash
npm --prefix shared/emails run preview
```

Renders all 18 emails plus 10 edge cases to `shared/emails/preview/`. Open `index.html` in a
browser. It **fails loudly** if any email contains `undefined`, `NaN`, `[object Object]`, an
unfilled `{{…}}`, or a dead link — which is how the original bugs stayed hidden for so long.

---

## Part 3 — Deploying

Because the repo is public, **your deploy process does not change at all.** No tokens, no
`.npmrc`, no git config, nothing per-server.

**Your own server / VPS (PM2):**

```bash
git pull && npm ci && npm run build && pm2 restart <app>
```

**Render / Railway / Heroku:** leave the build command exactly as it is. `npm ci` will fetch
`@rawura/emails` from GitHub with no credentials.

**✓ Check after deploying** — should print `18`:

```bash
node -e "console.log(require('@rawura/emails').getAvailableTemplates().length)"
```

### ⚠ The one rule that applies everywhere

**Do not delete `node_modules` after building.**

The email templates are read from `node_modules/@rawura/emails/dist/src/templates` *while the
app is running*, not compiled into your `dist/`. If your deploy prunes `node_modules`, the
service will start up perfectly and then crash with `Email template not found` on the first
customer order.

If you have a step like `npm prune --production`, that is fine — `@rawura/emails` is a real
dependency and survives it. Only a full delete is dangerous.

---

## Part 4 — Making a change later

When you edit a template, fix a typo, or add a new email:

```bash
# 1. Publish the change
cd shared/emails
npm version patch          # bumps 1.0.0 -> 1.0.1 and creates the tag automatically
git push --follow-tags

# 2. Pull it into whichever services should get it
cd ../Main-server
npm update @rawura/emails
git add package-lock.json && git commit -m "Update emails to 1.0.1" && git push

cd ../event-bus
npm update @rawura/emails
git add package-lock.json && git commit -m "Update emails to 1.0.1" && git push

# 3. Get your local link back
cd .. && ./link-shared-emails.sh
```

**Which number to bump:**

| Command | When |
|---|---|
| `npm version patch` | wording, styling, a bug fix |
| `npm version minor` | a new email type, a new optional field |
| `npm version major` | you renamed or removed a field an email depends on |

**Nothing reaches customers until a service's lockfile changes.** That is deliberate: editing
a template can't silently alter what a service sends in the middle of someone else's deploy.

---

## Part 5 — Things that will confuse you

### "Why is there no `dist/` folder on GitHub?"

Correct and intentional. `dist/` is the compiled output. If it were committed, it would go
stale the moment someone edited the source and forgot to rebuild — and you would ship the old
version without noticing.

Instead, `package.json` has a `prepare` script. npm runs it **automatically** after
downloading the package, so the build always matches the source. You never run it yourself for
a deploy.

### "The repo is public — will it get published to npm by accident?"

No. `package.json` has `"private": true`, which blocks `npm publish` outright. It has no effect
on installing from git, so it is pure safety. Leave it there.

### "I edited a template and nothing changed"

In order of likelihood:

1. You ran `npm install` recently, which broke the link → run `./link-shared-emails.sh`
2. You edited a `.ts` file and didn't rebuild → `npm --prefix shared/emails run build`
3. Templates are cached → restart the service, or use `EMAIL_TEMPLATE_NO_CACHE=1`

### "Do I have to copy files into the two services?"

No. Never. That was the old broken way. npm handles it.

---

## Part 6 — What is public, and what stays private

The repo was scanned before publishing. It contains **no credentials and no customer data**.

**In the repo (all harmless):**

- HTML email templates and TypeScript types
- Your public storefront URLs (`rawura.com`), support address, social links
- The CDN hostname that already serves product images to every customer's browser
- `example.com` addresses in test fixtures

**Never in the repo — these live in environment variables on your servers:**

- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- `UNSUBSCRIBE_SECRET`, `INTERNAL_SERVICE_KEY`
- Database URLs, Paystack keys

The code *references* those names (`process.env.SMTP_PASS`) but never contains their values.
That distinction is what makes the repo safe to publish.

**One habit to keep:** if you ever hardcode a real value into this package "just to test it",
do not commit it. Public git history is permanent and indexed.

---

## Part 7 — Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `No matching version found for @rawura/emails` | You pushed the code but not the tag | `cd shared/emails && git push origin v1.0.0` (Step 3) |
| `Email template not found` at runtime | `node_modules` was deleted after build | Keep `node_modules` in the running app |
| `Cannot find module '@rawura/emails'` | `npm install` hasn't run since the dependency was added | `npm install` in that service |
| Template edits do nothing | Link was replaced by `npm install` | `./link-shared-emails.sh` |
| `remote origin already exists` in Step 2 | You ran the step twice | `git remote set-url origin https://github.com/OEPlast/emails.git` |
| `Updates were rejected` in Step 2 | Repo wasn't created empty | `git push -u origin main --force` (safe — the repo is new) |

---

## Quick reference

```bash
# Local dev, after any npm install
./link-shared-emails.sh

# Rebuild after editing shared/emails
npm --prefix shared/emails run build

# Preview all emails in a browser
npm --prefix shared/emails run preview

# Ship a change
cd shared/emails && npm version patch && git push --follow-tags

# Confirm a deployment is healthy (expect: 18)
node -e "console.log(require('@rawura/emails').getAvailableTemplates().length)"
```

**Three repos now, not two:**

| Repo | Holds |
|---|---|
| `OEPlast/emails` | templates, types, renderer, SMTP transport |
| `OEPlast/Main-server` | order data, sends account + return emails |
| `OEPlast/event-bus` | sends order lifecycle emails from queued events |

Deeper reference — CI examples, Docker, switching to a private registry later — is in
`shared/emails/PUBLISHING.md`.
