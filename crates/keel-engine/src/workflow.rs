//! The 8-step idempotent initialization workflow (v2 legacy + v3 multi-repo/monolith).
//!
//! Each path emits exactly one [`ProgressEvent`] per step whose `key` is the matching entry of
//! [`keel_core::WORKFLOW_STEPS`] (`signin … register`, steps `1..=8`), in canonical order,
//! regardless of inputs or whether the repo(s) already existed.
//!
//! Dispatch (SPEC §12):
//! - `req.services.is_empty()` ⇒ [`legacy`] — the frozen v2 single-service path, byte-identical.
//! - otherwise `req.layout` picks [`multi`] (one repo per service) or [`mono`] (one composed
//!   monolith repo with `services/{dir}/` trees + `keel.services.json`).
//!
//! This parent module owns the pieces every path shares: the [`EventLog`], step titles, branch
//! fallbacks, service-blueprint resolution, per-service context building, and the committed
//! `branch-protection.json` governance record.

pub(crate) mod add_service;
mod mono;
mod multi;

use std::path::{Path, PathBuf};

use keel_blueprint::{Manifest, ServiceCtx};
use keel_core::{
    service_dirs, service_repo_names, InitOutcome, InitRequest, KeelError, ProgressEvent,
    ProtectionPolicy, RepoCoordinates, RepoLayout, RepoProvider, Result, Status, WORKFLOW_STEPS,
};

/// Default branch model when the manifest declares none.
const DEFAULT_BRANCHES: [&str; 3] = ["main", "dev", "staging"];
/// Default branch name when the manifest declares none.
const DEFAULT_BRANCH: &str = "main";
/// Sub-directory of the blueprints dir holding the per-service blueprints (SPEC §12).
const SERVICES_SUBDIR: &str = "services";

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

/// Run the 8 ordered idempotent steps and return the outcome.
///
/// `owner` is the GitHub account/org new repos are created under; `blueprints_dir` is the search
/// path for blueprints; `catalog_path` is the JSON catalog the `register` step upserts.
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
    // A bare init (no explicit services) defaults to a single Python service derived from
    // `service_kind` (rest-api → api:python, worker → wk:python), rendered from
    // `blueprints/services/`. There is no separate legacy/`python-service` path: a plain init is
    // just a one-service multi-repo project.
    let defaulted;
    let req = if req.services.is_empty() {
        defaulted = InitRequest {
            services: keel_core::default_services(req.service_kind),
            ..req.clone()
        };
        &defaulted
    } else {
        req
    };
    match req.layout {
        RepoLayout::MultiRepo => {
            multi::run(req, owner, blueprints_dir, catalog_path, provider, on_event)
        }
        RepoLayout::Monolith => {
            mono::run(req, owner, blueprints_dir, catalog_path, provider, on_event)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event log
// ─────────────────────────────────────────────────────────────────────────────

/// Collects every emitted event (so the returned [`InitOutcome`] carries the full audit trail)
/// while forwarding each one live to the caller's `on_event` callback.
struct EventLog<'a> {
    events: Vec<ProgressEvent>,
    on_event: &'a mut dyn FnMut(&ProgressEvent),
}

impl<'a> EventLog<'a> {
    fn new(on_event: &'a mut dyn FnMut(&ProgressEvent)) -> Self {
        Self {
            events: Vec::with_capacity(WORKFLOW_STEPS.len()),
            on_event,
        }
    }

    /// Record the canonical event for `step` (1-based) and fire the live callback.
    fn record(&mut self, step: u8, status: Status, detail: impl Into<String>) {
        let idx = usize::from(step.saturating_sub(1));
        self.events.push(ProgressEvent::new(
            step,
            WORKFLOW_STEPS[idx],
            STEP_TITLES[idx],
            status,
            detail,
        ));
        if let Some(event) = self.events.last() {
            (self.on_event)(event);
        }
    }

    /// The complete ordered audit trail.
    fn into_events(self) -> Vec<ProgressEvent> {
        self.events
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest-derived branch model (shared by every path)
// ─────────────────────────────────────────────────────────────────────────────

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

/// Ensure a repo's branch set + protection policies per `manifest`, reflecting the ensured
/// branches back into `repo.branches` (union, default first). Returns the number of policies
/// successfully applied (protection is best-effort and never aborts initialization).
fn ensure_branches_and_protection(
    provider: &dyn RepoProvider,
    repo: &mut RepoCoordinates,
    manifest: &Manifest,
) -> Result<usize> {
    let branches = branch_set(manifest);
    provider.ensure_branches(repo, &branches)?;
    for b in &branches {
        if !repo.branches.contains(b) {
            repo.branches.push(b.clone());
        }
    }
    let mut protected = 0usize;
    for policy in &manifest.repository.protect {
        if apply_protection(provider, repo, policy).is_ok() {
            protected += 1;
        }
    }
    Ok(protected)
}

// ─────────────────────────────────────────────────────────────────────────────
// v3 service-blueprint resolution + per-service contexts
// ─────────────────────────────────────────────────────────────────────────────

/// One resolved service blueprint: its directory name, on-disk location, and parsed manifest.
struct ServicePlan {
    /// Blueprint dir name (`{tag}-{lang}`), used in commit messages and diagnostics.
    blueprint_name: String,
    /// Absolute blueprint directory (`<blueprints_dir>/services/{tag}-{lang}`).
    dir: PathBuf,
    manifest: Manifest,
}

/// Resolve every selection to `blueprints/services/{tag}-{lang}` and load its manifest.
///
/// # Errors
/// [`KeelError::Validation`] naming the missing combo and listing every available one (by scanning
/// the services dir), so the caller can immediately see what IS supported.
fn resolve_services(req: &InitRequest, blueprints_dir: &Path) -> Result<Vec<ServicePlan>> {
    let services_root = blueprints_dir.join(SERVICES_SUBDIR);
    let mut plans = Vec::with_capacity(req.services.len());
    for sel in &req.services {
        let blueprint_name = sel.blueprint_name();
        let dir = services_root.join(&blueprint_name);
        if !dir.is_dir() {
            return Err(KeelError::Validation(format!(
                "no blueprint for service {}:{} (missing {}); available: {}",
                sel.service_type.tag(),
                sel.language,
                dir.display(),
                available_service_blueprints(&services_root),
            )));
        }
        let manifest = keel_blueprint::load_manifest(&dir)?;
        plans.push(ServicePlan {
            blueprint_name,
            dir,
            manifest,
        });
    }
    Ok(plans)
}

/// Sorted, comma-joined names of every service blueprint present on disk (`"(none)"` if empty).
fn available_service_blueprints(services_root: &Path) -> String {
    let Ok(entries) = std::fs::read_dir(services_root) else {
        return "(none)".to_owned();
    };
    let mut names: Vec<String> = entries
        .filter_map(std::result::Result::ok)
        .filter(|e| e.path().join("blueprint.yaml").is_file())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    if names.is_empty() {
        "(none)".to_owned()
    } else {
        names.join(", ")
    }
}

/// Build the per-service template contexts, index-aligned with `req.services` (repo names and
/// monolith dirs both follow keel-core's shared naming rule — explicit v5 names win, otherwise
/// the v4 ordinals).
///
/// # Errors
/// Propagates [`keel_core::resolve_service_names`] validation errors (invalid/duplicate names).
fn build_service_ctxs(req: &InitRequest) -> Result<Vec<ServiceCtx>> {
    let names = service_repo_names(&req.project_name, &req.services)?;
    let dirs = service_dirs(&req.services)?;
    Ok(req
        .services
        .iter()
        .zip(names.into_iter().zip(dirs))
        .map(|(sel, (repo_name, dir))| ServiceCtx {
            tag: sel.service_type.tag().to_owned(),
            dir,
            lang: sel.language.clone(),
            label: sel.service_type.label().to_owned(),
            repo_name,
        })
        .collect())
}
