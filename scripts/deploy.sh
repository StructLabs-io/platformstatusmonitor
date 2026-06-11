#!/usr/bin/env bash
# PSM deploy script — injects build identity at build/deploy time.
#
# Usage:
#   ./scripts/deploy.sh [web|worker|all] [--dry-run]
#
# Reads version from each app's package.json; computes BUILD_NUMBER and
# GIT_SHA from the current git state so values are reproducible from any clone.
#
# Configuration (all overridable via environment or scripts/deploy.env):
#
#   CLOUDFLARE_API_TOKEN     Cloudflare API token with Pages + Workers + KV scope (required)
#   PSM_WORKER_URL           Public URL of the Worker (e.g. https://<name>.<subdomain>.workers.dev)
#   PSM_PAGES_URL            Public URL of the Pages site (e.g. https://psm.example.com)
#   PSM_PAGES_PROJECT_NAME   Cloudflare Pages project name (e.g. platformstatusmonitor)
#   PSM_DEPLOY_BRANCH        Pages branch to deploy to (default: main)
#
# Resolution order for each variable:
#   1. process environment
#   2. scripts/deploy.env (gitignored — copy from scripts/deploy.env.example)
#   3. <repo-root>/.env
#
# Pass --dry-run to print the resolved configuration and the commands that
# would run, without executing pnpm build / wrangler deploy / smoke tests.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Parse args ──────────────────────────────────────────────────────────────
TARGET="all"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    web|worker|all) TARGET="$arg" ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      echo "[deploy] unknown argument: $arg" >&2
      echo "Usage: $0 [web|worker|all] [--dry-run]" >&2
      exit 1
      ;;
  esac
done

# ── Load configuration ──────────────────────────────────────────────────────
# Layer 1: scripts/deploy.env (operator-local, gitignored)
if [[ -f "$REPO_ROOT/scripts/deploy.env" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$REPO_ROOT/scripts/deploy.env"; set +a
fi

# Layer 2: <repo-root>/.env
if [[ -f "$REPO_ROOT/.env" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$REPO_ROOT/.env"; set +a
fi

# ── Apply defaults ──────────────────────────────────────────────────────────
PSM_DEPLOY_BRANCH="${PSM_DEPLOY_BRANCH:-main}"

# Worker URL can also be supplied as NEXT_PUBLIC_WORKER_BASE_URL (build-time var).
if [[ -z "${PSM_WORKER_URL:-}" && -n "${NEXT_PUBLIC_WORKER_BASE_URL:-}" ]]; then
  PSM_WORKER_URL="$NEXT_PUBLIC_WORKER_BASE_URL"
fi

# ── Validate required config ────────────────────────────────────────────────
missing=()
[[ -z "${CLOUDFLARE_API_TOKEN:-}"   ]] && missing+=("CLOUDFLARE_API_TOKEN")
[[ -z "${PSM_WORKER_URL:-}"         ]] && missing+=("PSM_WORKER_URL")
[[ -z "${PSM_PAGES_URL:-}"          ]] && missing+=("PSM_PAGES_URL")
[[ -z "${PSM_PAGES_PROJECT_NAME:-}" ]] && missing+=("PSM_PAGES_PROJECT_NAME")

if (( ${#missing[@]} > 0 )); then
  echo "[deploy] ERROR: missing required configuration: ${missing[*]}" >&2
  echo "[deploy] Set them in the environment, scripts/deploy.env, or <repo>/.env" >&2
  echo "[deploy] See scripts/deploy.env.example for a template." >&2
  exit 1
fi

export CLOUDFLARE_API_TOKEN

BUILD_NUMBER="$(git -C "$REPO_ROOT" rev-list --count HEAD)"
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

WEB_VERSION="$(node -p "require('$REPO_ROOT/apps/web/package.json').version")"
WORKER_VERSION="$(node -p "require('$REPO_ROOT/apps/worker/package.json').version")"

echo "[deploy] target=${TARGET} dry_run=${DRY_RUN}"
echo "[deploy] build=${BUILD_NUMBER} sha=${GIT_SHA}"
echo "[deploy] worker_url=${PSM_WORKER_URL}"
echo "[deploy] pages_url=${PSM_PAGES_URL}"
echo "[deploy] pages_project=${PSM_PAGES_PROJECT_NAME} branch=${PSM_DEPLOY_BRANCH}"

run() {
  if (( DRY_RUN )); then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

# ── Smoke test helpers ───────────────────────────────────────────────────────

# Basic HTTP 200 smoke test with retries.
smoke_test() {
  local label="$1"
  local url="$2"
  if (( DRY_RUN )); then
    echo "[dry-run] smoke_test ${label} ${url}"
    return 0
  fi
  local max_attempts=6
  local attempt=0
  echo "[smoke] testing ${label}: ${url}"
  while (( attempt < max_attempts )); do
    http_code="$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)" && true
    if [[ "$http_code" == "200" ]]; then
      echo "[smoke] ${label} OK (${http_code})"
      return 0
    fi
    attempt=$(( attempt + 1 ))
    echo "[smoke] ${label} attempt ${attempt}/${max_attempts}: got ${http_code}, retrying in 5s..."
    sleep 5
  done
  echo "[smoke] FAILED: ${label} at ${url} — last status: ${http_code}" >&2
  return 1
}

# Pages health smoke test: checks HTTP 200 AND that the deployed buildNumber
# matches the expected BUILD_NUMBER. Catches stale-out deploys where Pages
# serves an old build that happens to respond 200 on /api/health but is actually
# from a different commit.
smoke_test_pages_health() {
  local url="$1"
  local expected_build="$2"
  if (( DRY_RUN )); then
    echo "[dry-run] smoke_test_pages_health ${url} expected_build=${expected_build}"
    return 0
  fi
  local max_attempts=8
  local attempt=0
  echo "[smoke] testing pages-health build=${expected_build}: ${url}"
  while (( attempt < max_attempts )); do
    body="$(curl -sf "$url" 2>/dev/null)" && true
    if [[ -n "$body" ]]; then
      actual_build="$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('buildNumber',''))" 2>/dev/null)" && true
      if [[ "$actual_build" == "$expected_build" ]]; then
        echo "[smoke] pages-health OK (build=${actual_build})"
        return 0
      else
        echo "[smoke] pages-health attempt $((attempt+1))/${max_attempts}: live build=${actual_build:-unknown} != expected=${expected_build}, retrying in 5s..."
      fi
    else
      echo "[smoke] pages-health attempt $((attempt+1))/${max_attempts}: no response, retrying in 5s..."
    fi
    attempt=$(( attempt + 1 ))
    sleep 5
  done
  echo "[smoke] FAILED: pages-health — deployed build did not match expected ${expected_build} after ${max_attempts} attempts" >&2
  echo "[smoke] This means a stale or wrong static build was deployed. Run ./scripts/deploy.sh web from the correct commit." >&2
  return 1
}

deploy_web() {
  echo "[deploy] web v${WEB_VERSION} build=${BUILD_NUMBER} sha=${GIT_SHA}"
  export NEXT_PUBLIC_APP_VERSION="${WEB_VERSION}"
  export NEXT_PUBLIC_BUILD_NUMBER="${BUILD_NUMBER}"
  export NEXT_PUBLIC_GIT_SHA="${GIT_SHA}"
  # Worker URL must be baked at Next.js build time — NEXT_PUBLIC_* vars are
  # inlined by the bundler and cannot be injected at Pages deploy time.
  export NEXT_PUBLIC_WORKER_BASE_URL="${PSM_WORKER_URL}"
  run pnpm --dir "$REPO_ROOT/apps/web" build
  run pnpm --dir "$REPO_ROOT/apps/worker" exec wrangler pages deploy \
    "$REPO_ROOT/apps/web/out" \
    --project-name "$PSM_PAGES_PROJECT_NAME" \
    --commit-message "deploy: web v${WEB_VERSION} build=${BUILD_NUMBER} sha=${GIT_SHA}" \
    --branch "$PSM_DEPLOY_BRANCH"

  # ── Post-deploy smoke tests (up to 40s each) ────────────────────────────
  echo "[deploy] running post-deploy smoke tests..."
  smoke_test "pages-root"    "${PSM_PAGES_URL}/"
  # Validate build number in health response — catches stale-out redeployments
  # where the uploaded static files are from an older checkout.
  smoke_test_pages_health    "${PSM_PAGES_URL}/api/health" "${BUILD_NUMBER}"
  smoke_test "worker-health" "${PSM_WORKER_URL}/health"
  echo "[deploy] smoke tests passed"
}

deploy_worker() {
  echo "[deploy] worker v${WORKER_VERSION} build=${BUILD_NUMBER} sha=${GIT_SHA}"
  run pnpm --dir "$REPO_ROOT/apps/worker" exec wrangler deploy \
    --var "PSM_VERSION:${WORKER_VERSION}" \
    --var "PSM_BUILD_NUMBER:${BUILD_NUMBER}" \
    --var "PSM_GIT_SHA:${GIT_SHA}"

  # ── Post-deploy smoke test ───────────────────────────────────────────────
  echo "[deploy] running post-deploy worker smoke test..."
  smoke_test "worker-health" "${PSM_WORKER_URL}/health"
  echo "[deploy] worker smoke test passed"
}

case "$TARGET" in
  web)    deploy_web ;;
  worker) deploy_worker ;;
  all)    deploy_worker && deploy_web ;;
  *)
    echo "Usage: $0 [web|worker|all] [--dry-run]" >&2
    exit 1
    ;;
esac

echo "[deploy] done"
