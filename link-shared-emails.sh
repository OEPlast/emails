#!/usr/bin/env bash
#
# Local development: point one or more consumer services at a local shared package instead of
# the published version.
#
# In production the services install the package from its git tag, so an edit to the working
# copy would not reach them until it is committed, tagged and pushed. `npm link` restores the
# symlink behaviour for local work WITHOUT touching package.json or the lockfiles, so there is
# nothing to accidentally commit.
#
# Run once after cloning, and again after any `npm install` in a service — npm install
# replaces the link with the real dependency.
#
# Usage:
#   ./link-shared-emails.sh                          link the defaults
#   ./link-shared-emails.sh Main-server event-bus    link only these services
#   ./link-shared-emails.sh -s ../logger api worker  a different shared package
#   ./link-shared-emails.sh --unlink                 restore the published dependency
#
# Options:
#   -s, --shared <path>   Shared package directory.
#                         Default: this script's own directory if it contains a package.json,
#                         otherwise <root>/shared/emails.
#   -r, --root <path>     Directory that contains the service folders.
#                         Default: the nearest ancestor of the shared package that actually
#                         contains one of them.
#   -u, --unlink          Undo: drop the links so `npm install` restores the real dependency.
#   -h, --help            Show this help.
#
# The package name is read from the shared package's own package.json, so nothing here is
# specific to @rawura/emails.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEFAULT_SERVICES=("Main-server" "event-bus")
SHARED_DIR=""
ROOT_DIR=""
UNLINK=false
SERVICES=()

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  sed -n '3,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

# ---------------------------------------------------------------- arguments --

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--shared)
      [[ $# -ge 2 ]] || die "--shared needs a path"
      SHARED_DIR="$2"; shift 2 ;;
    -r|--root)
      [[ $# -ge 2 ]] || die "--root needs a path"
      ROOT_DIR="$2"; shift 2 ;;
    -u|--unlink)
      UNLINK=true; shift ;;
    -h|--help)
      usage ;;
    -*)
      die "unknown option: $1 (try --help)" ;;
    *)
      SERVICES+=("$1"); shift ;;
  esac
done

[[ ${#SERVICES[@]} -eq 0 ]] && SERVICES=("${DEFAULT_SERVICES[@]}")

# ------------------------------------------------------------- shared package --

# Default to the script's own directory when it looks like a package. This keeps the script
# working whether it sits at the project root or inside the package it links.
if [[ -z "$SHARED_DIR" ]]; then
  if [[ -f "$SCRIPT_DIR/package.json" ]]; then
    SHARED_DIR="$SCRIPT_DIR"
  else
    SHARED_DIR="$SCRIPT_DIR/shared/emails"
  fi
fi

[[ -d "$SHARED_DIR" ]] || die "shared package directory not found: $SHARED_DIR"
SHARED_DIR="$(cd "$SHARED_DIR" && pwd)"
[[ -f "$SHARED_DIR/package.json" ]] || die "no package.json in $SHARED_DIR"

# Resolved by cd-ing in rather than passing an absolute path: under Git Bash on Windows,
# $SHARED_DIR is an MSYS path (/c/Users/...) that node cannot resolve.
PKG_NAME="$(cd "$SHARED_DIR" && node -p "require('./package.json').name" 2>/dev/null || true)"
[[ -n "$PKG_NAME" ]] || die "could not read the package name from $SHARED_DIR/package.json"

# ------------------------------------------------------------------- root dir --

# Walk up from the package looking for the directory the services live in, so the script does
# not care how deeply nested the package is.
if [[ -z "$ROOT_DIR" ]]; then
  candidate="$SHARED_DIR"
  for _ in 1 2 3 4 5; do
    candidate="$(dirname "$candidate")"
    for service in "${SERVICES[@]}"; do
      if [[ -d "$candidate/$service" ]]; then
        ROOT_DIR="$candidate"
        break 2
      fi
    done
    [[ "$candidate" == "/" ]] && break
  done
fi

[[ -n "$ROOT_DIR" ]] || die "could not locate ${SERVICES[*]} above $SHARED_DIR — pass --root <path>"
[[ -d "$ROOT_DIR" ]] || die "root directory not found: $ROOT_DIR"
ROOT_DIR="$(cd "$ROOT_DIR" && pwd)"

# Fail before doing any work, so a typo cannot leave half the services linked.
for service in "${SERVICES[@]}"; do
  [[ -d "$ROOT_DIR/$service" ]] || die "service not found: $ROOT_DIR/$service"
  [[ -f "$ROOT_DIR/$service/package.json" ]] || die "no package.json in $ROOT_DIR/$service"
done

echo "package : $PKG_NAME"
echo "source  : $SHARED_DIR"
echo "services: ${SERVICES[*]}"
echo

# ---------------------------------------------------------------------- run --

# Relative to the root, so paths printed below are copy-pasteable and node resolves them
# without ever seeing an MSYS /c/... path.
REL_SHARED="${SHARED_DIR#"$ROOT_DIR"/}"

# The link is made by writing the symlink directly rather than with `npm link`.
#
# `npm link <pkg>` reconciles the consumer's entire dependency tree: it re-resolves all ~700
# packages, can move or reinstall ones unrelated to this change, and takes far longer. All we
# actually want is one entry in node_modules pointing at the working copy.
#
# 'junction' is used because Windows needs one for directory links without administrator
# rights; on Linux and macOS node ignores the type and writes an ordinary symlink.
link_one() {
  local service="$1" mode="$2"
  (cd "$ROOT_DIR" && node -e '
    const fs = require("fs"), path = require("path");
    const [shared, service, name, mode] = process.argv.slice(1);
    const linkPath = path.join(service, "node_modules", ...name.split("/"));

    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.rmSync(linkPath, { recursive: true, force: true });

    if (mode === "unlink") {
      console.log(`  removed ${linkPath}`);
      process.exit(0);
    }

    fs.symlinkSync(path.resolve(shared), linkPath, "junction");
    console.log(`  ${linkPath} -> ${shared}`);
  ' "$REL_SHARED" "$service" "$PKG_NAME" "$mode")
}

if [[ "$UNLINK" == true ]]; then
  for service in "${SERVICES[@]}"; do
    echo "Unlinking $PKG_NAME from $service..."
    link_one "$service" unlink
  done
  echo
  echo "Done. Run 'npm install' in each service to restore the published dependency."
  exit 0
fi

# Only install the shared package's own dependencies, and only when they are missing.
# Nothing is installed in the consumer services.
if [[ -d "$SHARED_DIR/node_modules" ]]; then
  echo "Dependencies for $PKG_NAME already present, skipping install."
else
  echo "Installing dependencies for $PKG_NAME (first run)..."
  (cd "$SHARED_DIR" && npm install --silent)
fi

echo "Building $PKG_NAME..."
(cd "$SHARED_DIR" && npm run build)

for service in "${SERVICES[@]}"; do
  echo "Linking into $service..."
  link_one "$service" link
done

echo
echo "Linked. ${#SERVICES[@]} service(s) now read $REL_SHARED directly."
echo "After editing it, rebuild:  npm --prefix $REL_SHARED run build"
echo "  (template-only edits need no rebuild if you set EMAIL_TEMPLATE_NO_CACHE=1)"
