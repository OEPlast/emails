# Distributing @rawura/emails

`Main-server`, `event-bus` and `storefront` are separate GitHub repositories under the
`OEPlast` org. `shared/` sits outside all of them, so this package has to be distributed
rather than shared through the filesystem — a `file:../shared/emails` dependency resolves on
a dev machine and nowhere else.

Both services install it as a **git dependency**:

```json
"@rawura/emails": "github:OEPlast/emails#semver:^1.0.0"
```

npm clones the repo at the highest matching tag, installs its devDependencies, runs the
`prepare` script (`npm run build`) and packs `dist/`. That is why `dist/` is gitignored:
committing it would only ever serve a stale build.

---

## One-time setup

This has not been done yet — **until it is, `npm install` in either service will fail**,
because `OEPlast/emails` does not exist.

1. Create an empty **public** repo `OEPlast/emails` on GitHub (no README, no .gitignore).

   Public was chosen deliberately: the package holds templates, types and rendering code, and
   no credentials — SMTP passwords, `UNSUBSCRIBE_SECRET` and gateway keys are all read from
   the environment at runtime and never appear here. Being public means no deploy keys, no
   tokens and no per-server git configuration anywhere. **The CI and Docker sections below
   are therefore not needed** — keep them only if the repo is ever made private.

2. Push this package to it:

   ```bash
   cd shared/emails
   git init
   git add .
   git commit -m "Shared transactional email package"
   git branch -M main
   git remote add origin git@github.com:OEPlast/emails.git
   git push -u origin main
   git tag v1.0.0
   git push origin v1.0.0
   ```

   The tag is what `#semver:^1.0.0` resolves against. A push without a tag changes nothing
   for the consumers.

3. Refresh each service's lockfile so the resolved commit is pinned:

   ```bash
   cd Main-server && npm install
   cd ../event-bus && npm install
   ```

   Commit the resulting `package-lock.json` in each repo.

4. Relink for local development (see below).

---

## Releasing a change

```bash
cd shared/emails
npm version patch          # or minor / major — updates package.json and creates the tag
git push && git push --tags
```

Then, in each service that should pick it up:

```bash
npm update @rawura/emails   # re-resolves the range, updates package-lock.json
```

Commit the lockfile. Nothing reaches production until a service's lockfile moves, which is
the safety property worth having: a template edit cannot silently change what customers
receive in an unrelated service mid-deploy.

Version discipline:

- **patch** — copy, styling, a template fix
- **minor** — a new email kind, a new optional payload field
- **major** — a renamed or removed payload field, or a required field added

A major bump breaks the consumer's build rather than its runtime, because payload types are
checked at compile time against the `EmailPayloadMap` registry. That is intentional.

---

## Local development

`npm link` restores the working-copy symlink without editing `package.json` or the lockfile,
so there is nothing to accidentally commit:

```bash
./link-shared-emails.sh            # from the repo root
./link-shared-emails.sh --unlink   # go back to the published dependency
```

Re-run it after any `npm install` in a service — npm install replaces the link with the real
dependency.

After editing the package, rebuild it so the services see the change:

```bash
npm --prefix shared/emails run build
```

Template-only edits need no rebuild if you run the service with
`EMAIL_TEMPLATE_NO_CACHE=1`, which re-reads `.html` files on every send.

---

## CI and deployment

> **Not needed while `OEPlast/emails` is public.** With a public repo, `npm ci` fetches the
> package with no credentials, so every deploy pipeline works unchanged. Everything below
> applies only if the repo is later made private.

npm needs **git on PATH** and **credentials for a private repo**. Pick whichever fits the
platform:

**GitHub Actions** — the checkout token does not cover other repos. Use a PAT or a deploy
key with read access to `OEPlast/emails`:

```yaml
- uses: actions/checkout@v4
- run: git config --global url."https://${{ secrets.EMAILS_TOKEN }}@github.com/".insteadOf "ssh://git@github.com/"
- run: npm ci
```

**Buildpack platforms (Render / Railway / Heroku)** — set the same rewrite in a build
command, since you cannot install an SSH key:

```bash
git config --global url."https://${EMAILS_TOKEN}@github.com/".insteadOf "ssh://git@github.com/" && npm ci && npm run build
```

**Docker** — the base image must have git, and the token must not land in a layer. Use a
BuildKit secret, never an `ARG`:

```dockerfile
FROM node:20-alpine AS build
RUN apk add --no-cache git openssh-client
WORKDIR /app
COPY package*.json ./
# --mount=type=secret keeps the token out of the image history.
RUN --mount=type=secret,id=gh_token \
    git config --global url."https://$(cat /run/secrets/gh_token)@github.com/".insteadOf "ssh://git@github.com/" \
    && npm ci \
    && git config --global --unset url."https://$(cat /run/secrets/gh_token)@github.com/".insteadOf
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
CMD ["node", "dist/server.js"]
```

Build with:

```bash
DOCKER_BUILDKIT=1 docker build --secret id=gh_token,env=EMAILS_TOKEN -t rawura/main-server .
```

Note the build stage keeps `node_modules` — `@rawura/emails` resolves to a real directory
under `node_modules`, and the email templates are read from it **at runtime**, so it must be
present in the final image. Copying only `dist` would give you a service that starts and
then throws `Email template not found` on the first order.

**Making the repo public** removes all of the above; `npm ci` then needs nothing but git.
It contains no secrets — only templates, types and rendering code — so that is a reasonable
option if the org is comfortable with it.

---

## Verifying a deployment

```bash
node -e "const e=require('@rawura/emails'); console.log(e.getAvailableTemplates().length)"
```

Expect `18`. Anything less means `dist/src/templates` did not survive the build — check that
`prepare` ran and that `node_modules` was carried into the runtime image.
