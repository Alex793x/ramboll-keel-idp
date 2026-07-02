//! The frozen v2 single-service path (`req.services` empty) — byte-identical to the original
//! 8-step workflow.
//!
//! Idempotency is achieved by:
//! - **`create_repo` / `commit`** — if [`RepoProvider::repo_exists`] reports the repo is already
//!   present, both steps emit `Skipped` and the existing coordinates are reused (the provider's own
//!   `create_repo` is also idempotent, so this is belt-and-braces).
//! - **`register`** — the catalog upsert is keyed on a stable `catalog_id`, so a second run replaces
//!   the existing row rather than appending a duplicate.

use std::path::Path;

use keel_core::{
    InitOutcome, InitRequest, ProgressEvent, RepoCoordinates, RepoProvider, RepoSpec, Result,
    Status,
};

use super::{branch_protection_file, default_branch, ensure_branches_and_protection, EventLog};
use crate::catalog;

/// Run the legacy v2 workflow (single blueprint → single repo).
///
/// # Errors
/// Propagates validation, render, and provider errors as [`keel_core::KeelError`].
pub(super) fn run(
    req: &InitRequest,
    owner: &str,
    blueprints_dir: &Path,
    catalog_path: &Path,
    provider: &dyn RepoProvider,
    on_event: &mut dyn FnMut(&ProgressEvent),
) -> Result<InitOutcome> {
    let mut log = EventLog::new(on_event);

    // ── Step 1: signin ───────────────────────────────────────────────────────
    // The API/CLI authenticated the caller before we were invoked; nothing to do.
    log.record(1, Status::Done, "authenticated by caller");

    // ── Step 2: form ─────────────────────────────────────────────────────────
    // Load the manifest and validate the request against it. A cheap structural pre-check first
    // gives a clearer error before we touch the filesystem.
    req.validate_basic()?;
    let blueprint_dir = blueprints_dir.join(&req.blueprint);
    let manifest = keel_blueprint::load_manifest(&blueprint_dir)?;
    keel_blueprint::validate_request(&manifest, req)?;
    log.record(
        2,
        Status::Done,
        format!("validated against {}", req.blueprint),
    );

    // ── Step 3: render ───────────────────────────────────────────────────────
    let mut files = keel_blueprint::render(&manifest, &blueprint_dir, req)?;
    // Durable governance record: always commit the intended branch-protection policy into the repo.
    // Hosts cannot always *enforce* protection (e.g. personal accounts, where the `gh api` call is
    // skipped), so the committed `branch-protection.json` is the authoritative record of intent.
    files.push(branch_protection_file(&manifest)?);
    log.record(3, Status::Done, format!("rendered {} file(s)", files.len()));

    // ── Step 4 + 5: create_repo + commit ─────────────────────────────────────
    let name = &req.project_name;
    let already_exists = provider.repo_exists(owner, name)?;
    let branch = default_branch(&manifest);

    let mut repo: RepoCoordinates = if already_exists {
        // Idempotent path: do not create a second repo, do not push a second commit.
        log.record(4, Status::Skipped, format!("{owner}/{name} already exists"));
        log.record(5, Status::Skipped, "initial commit already present");
        // Reuse coordinates. The provider's create_repo is idempotent and returns the existing
        // coordinates, so this is a safe, side-effect-free way to fetch them.
        provider.create_repo(&repo_spec(req, owner, branch.clone(), files))?
    } else {
        let coords = provider.create_repo(&repo_spec(req, owner, branch.clone(), files))?;
        log.record(4, Status::Done, format!("created {}", coords.html_url));
        log.record(
            5,
            Status::Done,
            format!("one clean initial commit on {branch}"),
        );
        coords
    };

    // ── Step 6: branches ─────────────────────────────────────────────────────
    let protected = ensure_branches_and_protection(provider, &mut repo, &manifest)?;
    log.record(
        6,
        Status::Done,
        format!(
            "{} branch(es), {protected} protection policy(ies)",
            repo.branches.len()
        ),
    );

    // ── Step 7: seed_ci ──────────────────────────────────────────────────────
    // No-op: CI workflows + docs ship inside the rendered template tree.
    log.record(7, Status::Done, "CI + docs included in rendered tree");

    // ── Step 8: register ─────────────────────────────────────────────────────
    let catalog_id = catalog::catalog_id(owner, name);
    log.record(
        8,
        Status::Done,
        format!("upserted catalog row {catalog_id}"),
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
        events: log.into_events(),
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
