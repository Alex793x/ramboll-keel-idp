//! The v3 multi-repo path (SPEC §12): one repository per selected service.
//!
//! Every selection resolves to `blueprints/services/{tag}-{lang}` and renders with its own
//! per-service context ([`keel_blueprint::derive_context_v3`]); repo `i` is named
//! `service_repo_names(project, services)[i]`. The workflow still emits exactly the 8 canonical
//! events in order — steps 4/5/6 **aggregate** across repos (details list every repo; `Skipped`
//! only when ALL repos already existed). Idempotency and the committed `branch-protection.json`
//! governance record apply per repo.

use std::path::Path;

use keel_blueprint::derive_context_v3;
use keel_core::{
    InitOutcome, InitRequest, KeelError, ProgressEvent, RenderedFile, RepoCoordinates,
    RepoProvider, RepoSpec, Result, Status,
};

use super::{
    branch_protection_file, build_service_ctxs, default_branch, ensure_branches_and_protection,
    resolve_services, EventLog, ServicePlan,
};
use crate::catalog;

/// Run the multi-repo workflow (`services` non-empty, `layout = multi-repo`).
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
    log.record(1, Status::Done, "authenticated by caller");

    // ── Step 2: form ─────────────────────────────────────────────────────────
    // Structural pre-check, then resolve every selection to its service blueprint and validate
    // the request against each manifest.
    req.validate_basic()?;
    let plans = resolve_services(req, blueprints_dir)?;
    for plan in &plans {
        keel_blueprint::validate_request(&plan.manifest, req)?;
    }
    let Some(first_plan) = plans.first() else {
        // Unreachable: the dispatcher only routes here when `services` is non-empty.
        return Err(KeelError::Validation(
            "multi-repo layout requires at least one service".to_owned(),
        ));
    };
    log.record(
        2,
        Status::Done,
        format!("validated {} service blueprint(s)", plans.len()),
    );

    // ── Step 3: render ───────────────────────────────────────────────────────
    // Each service renders with its own context (`service` object + full `services` array), and
    // every repo gets the committed `branch-protection.json` governance record.
    let ctxs = build_service_ctxs(req)?;
    let mut file_sets: Vec<Vec<RenderedFile>> = Vec::with_capacity(plans.len());
    let mut total_files = 0usize;
    for (plan, ctx) in plans.iter().zip(&ctxs) {
        let context = derive_context_v3(req, Some(ctx), &ctxs);
        let mut files = keel_blueprint::render_with_context(&plan.manifest, &plan.dir, &context)?;
        files.push(branch_protection_file(&plan.manifest)?);
        total_files += files.len();
        file_sets.push(files);
    }
    log.record(
        3,
        Status::Done,
        format!(
            "rendered {total_files} file(s) across {} repo(s)",
            plans.len()
        ),
    );

    // ── Step 4 + 5: create_repo + commit (aggregated) ────────────────────────
    let mut repos: Vec<RepoCoordinates> = Vec::with_capacity(plans.len());
    let mut created: Vec<String> = Vec::new();
    let mut existing: Vec<String> = Vec::new();
    for ((plan, ctx), files) in plans.iter().zip(&ctxs).zip(file_sets) {
        let already_exists = provider.repo_exists(owner, &ctx.repo_name)?;
        // The provider's create_repo is idempotent, so on the existing path this is a safe,
        // side-effect-free way to fetch the coordinates (same belt-and-braces as legacy).
        let coords = provider.create_repo(&service_repo_spec(req, owner, plan, ctx, files))?;
        if already_exists {
            existing.push(ctx.repo_name.clone());
        } else {
            created.push(ctx.repo_name.clone());
        }
        repos.push(coords);
    }
    if created.is_empty() {
        log.record(
            4,
            Status::Skipped,
            format!(
                "all {} repo(s) already exist: {}",
                existing.len(),
                existing.join(", ")
            ),
        );
        log.record(5, Status::Skipped, "initial commits already present");
    } else {
        let mut detail = format!("created {} repo(s): {}", created.len(), created.join(", "));
        if !existing.is_empty() {
            detail.push_str(&format!(" ({} already existed)", existing.len()));
        }
        log.record(4, Status::Done, detail);
        log.record(
            5,
            Status::Done,
            format!("one clean initial commit per repo ({})", created.join(", ")),
        );
    }

    // ── Step 6: branches (aggregated) ────────────────────────────────────────
    let mut total_branches = 0usize;
    let mut protected = 0usize;
    for (plan, repo) in plans.iter().zip(repos.iter_mut()) {
        protected += ensure_branches_and_protection(provider, repo, &plan.manifest)?;
        total_branches += repo.branches.len();
    }
    log.record(
        6,
        Status::Done,
        format!(
            "{total_branches} branch(es) across {} repo(s), {protected} protection policy(ies)",
            repos.len()
        ),
    );

    // ── Step 7: seed_ci ──────────────────────────────────────────────────────
    log.record(7, Status::Done, "CI + docs included in rendered tree");

    // ── Step 8: register ─────────────────────────────────────────────────────
    // One catalog row per PROJECT (keyed on the project name), carrying every repo.
    let catalog_id = catalog::catalog_id(owner, &req.project_name);
    log.record(
        8,
        Status::Done,
        format!("upserted catalog row {catalog_id}"),
    );

    let Some(first_repo) = repos.first().cloned() else {
        // Unreachable: `repos` is index-aligned with the non-empty `plans`.
        return Err(KeelError::Github(
            "multi-repo initialization produced no repositories".to_owned(),
        ));
    };
    let outcome = InitOutcome {
        project: req.project_name.clone(),
        docs_path: format!("{}/docs", first_repo.name),
        repo: first_repo,
        repos,
        blueprint_version: first_plan.manifest.version.clone(),
        catalog_id,
        events: log.into_events(),
        provenance: Some(keel_core::Provenance::from_request(req)),
    };
    catalog::upsert(catalog_path, &outcome)?;
    Ok(outcome)
}

/// Build the [`RepoSpec`] for one service repo (shared with the v5 add-service path).
pub(super) fn service_repo_spec(
    req: &InitRequest,
    owner: &str,
    plan: &ServicePlan,
    ctx: &keel_blueprint::ServiceCtx,
    files: Vec<RenderedFile>,
) -> RepoSpec {
    RepoSpec {
        owner: owner.to_owned(),
        name: ctx.repo_name.clone(),
        description: req.description.clone(),
        private: true,
        default_branch: default_branch(&plan.manifest),
        files,
        commit_message: format!(
            "chore: scaffold from Keel {} blueprint",
            plan.blueprint_name
        ),
    }
}
