# tracker/github-rs.md — Fleet-Github-RS

**Area:** GitHub provider (Rust) · **Subtree:** `crates/keel-github/` (exclusive)
**Status:** ✅ done — `cargo test -p keel-github` green (12 unit tests, 1 ignored integration test), `cargo clippy -p keel-github --all-targets -- -D warnings` clean.

## What shipped

Implemented the real `GhCliProvider` (subprocess over `gh` + `git`) and added the new additive
type `LocalDirProvider` (hermetic, on-disk, no network). `FakeProvider` is untouched and its two
Phase-0 tests still pass. No frozen public signature was changed.

### Module layout (added private modules; only `GhCliProvider`, `LocalDirProvider`, and the argv
helper are public)
- `src/lib.rs` — module wiring + re-exports; `FakeProvider` (unchanged) + its tests.
- `src/cmd.rs` — `std::process::Command` / `std::fs` helpers shared by both real providers:
  `run` (trimmed stdout, non-zero ⇒ `KeelError::Github`), `capture` (raw `Output`, caller judges),
  `describe`, `write_files` (byte-correct, creates parent dirs), `git_init_commit`
  (`git init -b <branch>` → `git -c user.email=keel@ramboll.com -c user.name=Keel add -A` → commit).
- `src/gh.rs` — `GhCliProvider` + the pure argv helper.
- `src/local.rs` — `LocalDirProvider`.

### `GhCliProvider` behavior (SPEC §3.3)
- `repo_exists(owner,name)` → `gh repo view <owner>/<name>`; exit 0 ⇒ true, any non-zero ⇒ false
  (does not error on "not found").
- `create_repo(spec)` → **idempotent**: if `repo_exists`, return coordinates from
  `gh repo view <owner>/<name> --json url,defaultBranchRef`. Else: `tempfile::TempDir` staging →
  write every `RenderedFile` → `git init -b main` + add + commit (`spec.commit_message`) →
  `gh repo create <owner>/<name> --private|--public --source . --remote origin --push
  --description <description>` → read `html_url` back via `gh repo view --json url --jq .url`.
  Returns `RepoCoordinates{owner,name,html_url,default_branch:"main",branches:["main"]}`.
- `ensure_branches(repo,branches)` → for each branch ≠ default: get default tip sha via
  `gh api repos/{o}/{n}/git/ref/heads/{default} --jq .object.sha`, then
  `gh api -X POST repos/{o}/{n}/git/refs -f ref=refs/heads/<b> -f sha=<sha>`. Tolerates
  "already exists" / "Reference already exists".
- `write_protection(repo,policy)` → **best-effort**: builds the protection JSON body, writes it to a
  temp file, `gh api -X PUT repos/{o}/{n}/branches/{branch}/protection --input <file>`. On ANY
  failure (very common on personal repos) it logs to stderr and returns `Ok(())` — the durable
  record is the committed `branch-protection.json` (template-owned), so the workflow never fails.

### `LocalDirProvider { root: PathBuf }` (additive; `pub fn new(root: PathBuf) -> Self`)
Hermetic `RepoProvider` for green-from-birth testing (CLI `--local` + CI). No `gh`, no network.
- `repo_exists` → checks `<root>/<name>` is a dir.
- `create_repo` → `<root>/<name>` + write files + `git init -b main` + initial commit; idempotent
  (existing dir returned as-is, still one commit). `html_url = file://<abs path>`.
- `ensure_branches` → `git branch <b>` for each non-default branch (local `dev`/`staging`);
  tolerates already-existing.
- `write_protection` → no-op `Ok(())` (durable record is the committed `branch-protection.json`).

### The argv helper (pure, unit-tested)
`pub fn build_repo_create_argv(spec: &RepoSpec) -> Vec<String>` builds the exact `gh repo create`
argv from a `RepoSpec` (`--private`/`--public` flip on `spec.private`; `--source .`,
`--remote origin`, `--push`; `--description` as a single argv element). Re-exported from the crate
root so it is testable without invoking `gh`.

## Tests (`cargo test -p keel-github`, no `--ignored`, no network)
- Kept both `FakeProvider` tests.
- `cmd`: `write_files` byte-correct + nested dirs; `run` surfaces a `KeelError::Github` on non-zero.
- `gh` (pure argv): private argv is exact; `--public` flag flips; description with spaces stays one
  argv element.
- `local`: files written byte-correct incl. a file containing `${{ matrix.os }}`; exactly one
  commit (`git log --oneline`); `main`/`dev`/`staging` exist; `create_repo` idempotent (still one
  commit after re-create); `ensure_branches` tolerant of existing.
- `tests/gh_integration.rs`: real-`gh` create→verify(dev/staging via `gh api`)→delete throwaway
  repo under `Alex793x`, annotated `#[ignore]`. Run with `cargo test -p keel-github -- --ignored`.
  **Not run by this agent** — the orchestrator runs the real E2E.

Result: `12 passed; 0 failed; 1 ignored`.

## Dependency change
Added `tempfile` to `[dependencies]` (already in `[workspace.dependencies]` and was in
`[dev-dependencies]`). This is the single allowed dependency change for this area. No other
`Cargo.toml` edits.

## Notes
- `cargo build --workspace` currently fails in `crates/keel-api` (only `main.rs`, no `lib.rs`) —
  that is Fleet-Api-RS's subtree, pre-existing and unrelated to this area. `keel-github` compiles
  and tests green on its own (`cargo test -p keel-github`, `cargo clippy -p keel-github
  --all-targets -- -D warnings`).

## MemTrace
- START intent published: repo `keel`, agent `fleet-github-rs`, branch `main`, no conflicts
  (intent_id `01KW8C1PCNNFR456S1GMZGE9B8`, advice `clear`).
- END episode recorded (see summary).
