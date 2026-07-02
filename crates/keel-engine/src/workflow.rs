//! The 8-step idempotent initialization workflow.
//!
//! Each step emits exactly one [`ProgressEvent`] whose `key` is the matching entry of
//! [`keel_core::WORKFLOW_STEPS`] (`signin … register`, steps `1..=8`), in canonical order,
//! regardless of inputs or whether the repo already existed. Idempotency is achieved by:
//!
//! - **`create_repo` / `commit`** — if [`RepoProvider::repo_exists`] reports the repo is already
//!   present, both steps emit `Skipped` and the existing coordinates are reused (the provider's own
//!   `create_repo` is also idempotent, so this is belt-and-braces).
//! - **`register`** — the catalog upsert is keyed on a stable `catalog_id`, so a second run replaces
//!   the existing row rather than appending a duplicate.

use std::path::Path;

use keel_blueprint::Manifest;
use keel_core::{
    InitOutcome, InitRequest, ProgressEvent, ProtectionPolicy, RepoCoordinates, RepoProvider,
    RepoSpec, Result, Status, WORKFLOW_STEPS,
};

use crate::catalog;

/// Default branch model when the manifest declares none.
const DEFAULT_BRANCHES: [&str; 3] = ["main", "dev", "staging"];
/// Default branch name when the manifest declares none.
const DEFAULT_BRANCH: &str = "main";

/// Human-readable step titles (index = step - 1), shown in the Hub progress view.
const STEP_TITLES: [&str; 8] = [
    "Sign in",
    "Validate form",
    "Render blueprint",
    "Create repository",
    "Initial commit",
    "Create branches",
    "Seed CI",
    "Register project",
];

/// The default branch to use for a repo, honoring the manifest then falling back to `main`.
fn default_branch(manifest: &Manifest) -> String {
    let b = manifest.repository.default_branch.trim();
    if b.is_empty() {
        DEFAULT_BRANCH.to_owned()
    } else {
        b.to_owned()
    }
}

/// The full branch set to ensure, honoring the manifest then falling back to `[main, dev, staging]`.
fn branch_set(manifest: &Manifest) -> Vec<String> {
    if manifest.repository.branches.is_empty() {
        DEFAULT_BRANCHES.iter().map(|s| (*s).to_owned()).collect()
    } else {
        manifest.repository.branches.clone()
    }
}

/// Run the 8 ordered idempotent steps and return the outcome.
///
/// `owner` is the GitHub account/org new repos are created under; `blueprints_dir` is the search
/// path for the requested blueprint; `catalog_path` is the JSON catalog the `register` step upserts.
///
/// # Errors
/// Propagates validation, render, and provider errors as [`keel_core::KeelError`].
pub(crate) fn run(
    req: &InitRequest,
    owner: &str,
    blueprints_dir: &Path,
    catalog_path: &Path,
    provider: &dyn RepoProvider,
    on_event: &mut dyn FnMut(&ProgressEvent),
) -> Result<InitOutcome> {
    // We collect every emitted event so the returned InitOutcome carries the full audit trail,
    // while ALSO forwarding each event live to the caller's `on_event` callback. `record` pushes
    // onto `events` and fires the callback for the just-pushed event, so it never needs to borrow
    // `events` while we also read it elsewhere.
    let mut events: Vec<ProgressEvent> = Vec::with_capacity(WORKFLOW_STEPS.len());
    macro_rules! record {
        ($step:expr, $status:expr, $detail:expr) => {{
            let idx = ($step - 1) as usize;
            events.push(ProgressEvent::new(
                $step,
                WORKFLOW_STEPS[idx],
                STEP_TITLES[idx],
                $status,
                $detail,
            ));
            on_event(events.last().expect("just pushed"));
        }};
    }

    // ── Step 1: signin ───────────────────────────────────────────────────────
    // The API/CLI authenticated the caller before we were invoked; nothing to do.
    record!(1, Status::Done, "authenticated by caller".to_owned());

    // ── Step 2: form ─────────────────────────────────────────────────────────
    // Load the manifest and validate the request against it. A cheap structural pre-check first
    // gives a clearer error before we touch the filesystem.
    req.validate_basic()?;
    let blueprint_dir = blueprints_dir.join(&req.blueprint);
    let manifest = keel_blueprint::load_manifest(&blueprint_dir)?;
    keel_blueprint::validate_request(&manifest, req)?;
    record!(
        2,
        Status::Done,
        format!("validated against {}", req.blueprint)
    );

    // ── Step 3: render ───────────────────────────────────────────────────────
    let mut files = keel_blueprint::render(&manifest, &blueprint_dir, req)?;
    // Durable governance record: always commit the intended branch-protection policy into the repo.
    // Hosts cannot always *enforce* protection (e.g. personal accounts, where the `gh api` call is
    // skipped), so the committed `branch-protection.json` is the authoritative record of intent.
    files.push(branch_protection_file(&manifest)?);
    record!(3, Status::Done, format!("rendered {} file(s)", files.len()));

    // ── Step 4 + 5: create_repo + commit ─────────────────────────────────────
    let name = &req.project_name;
    let already_exists = provider.repo_exists(owner, name)?;
    let branch = default_branch(&manifest);

    let mut repo: RepoCoordinates = if already_exists {
        // Idempotent path: do not create a second repo, do not push a second commit.
        record!(4, Status::Skipped, format!("{owner}/{name} already exists"));
        record!(
            5,
            Status::Skipped,
            "initial commit already present".to_owned()
        );
        // Reuse coordinates. The provider's create_repo is idempotent and returns the existing
        // coordinates, so this is a safe, side-effect-free way to fetch them.
        provider.create_repo(&repo_spec(req, owner, branch.clone(), files))?
    } else {
        let coords = provider.create_repo(&repo_spec(req, owner, branch.clone(), files))?;
        record!(4, Status::Done, format!("created {}", coords.html_url));
        record!(
            5,
            Status::Done,
            format!("one clean initial commit on {branch}")
        );
        coords
    };

    // ── Step 6: branches ─────────────────────────────────────────────────────
    let branches = branch_set(&manifest);
    provider.ensure_branches(&repo, &branches)?;
    // Reflect the ensured branches in the returned coordinates (union, default first).
    for b in &branches {
        if !repo.branches.contains(b) {
            repo.branches.push(b.clone());
        }
    }
    // Apply protection policies best-effort (a failure here must not abort initialization).
    let mut protected = 0usize;
    for policy in &manifest.repository.protect {
        if apply_protection(provider, &repo, policy).is_ok() {
            protected += 1;
        }
    }
    record!(
        6,
        Status::Done,
        format!(
            "{} branch(es), {protected} protection policy(ies)",
            repo.branches.len()
        )
    );

    // ── Step 7: seed_ci ──────────────────────────────────────────────────────
    // No-op: CI workflows + docs ship inside the rendered template tree.
    record!(
        7,
        Status::Done,
        "CI + docs included in rendered tree".to_owned()
    );

    // ── Step 8: register ─────────────────────────────────────────────────────
    let catalog_id = catalog::catalog_id(owner, name);
    record!(
        8,
        Status::Done,
        format!("upserted catalog row {catalog_id}")
    );

    // Build the outcome carrying the COMPLETE event set (all 8, incl. register) and persist exactly
    // that, so `list_projects` round-trips what `initialize` returns.
    let outcome = InitOutcome {
        project: name.clone(),
        repos: vec![repo.clone()],
        repo,
        docs_path: format!("{name}/docs"),
        blueprint_version: manifest.version.clone(),
        catalog_id,
        events,
    };
    catalog::upsert(catalog_path, &outcome)?;
    Ok(outcome)
}

/// Build the [`RepoSpec`] for the create/commit steps.
fn repo_spec(
    req: &InitRequest,
    owner: &str,
    default_branch: String,
    files: Vec<keel_core::RenderedFile>,
) -> RepoSpec {
    RepoSpec {
        owner: owner.to_owned(),
        name: req.project_name.clone(),
        description: req.description.clone(),
        private: true,
        default_branch,
        files,
        commit_message: "chore: scaffold from Keel python-service blueprint".to_owned(),
    }
}

/// Serialize the manifest's branch-protection policies into a committed `branch-protection.json`,
/// the durable record of protection intent (whether or not the host enforces it).
fn branch_protection_file(manifest: &Manifest) -> Result<keel_core::RenderedFile> {
    let mut contents = serde_json::to_vec_pretty(&manifest.repository.protect)
        .map_err(|e| keel_core::KeelError::Io(format!("serializing branch protection: {e}")))?;
    contents.push(b'\n');
    Ok(keel_core::RenderedFile {
        path: "branch-protection.json".to_owned(),
        contents,
    })
}

/// Apply one protection policy (best-effort wrapper, so callers can ignore failures).
fn apply_protection(
    provider: &dyn RepoProvider,
    repo: &RepoCoordinates,
    policy: &ProtectionPolicy,
) -> Result<()> {
    provider.write_protection(repo, policy)
}
