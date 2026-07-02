//! The v5 add-service workflow (SPEC §19.3): materialize ONE new service component into an
//! already-initialized project.
//!
//! Semantics:
//! - The final component name comes from [`keel_core::resolve_service_names`] over
//!   `existing ∪ new` — existing names are injected as explicit entries, so a collision (explicit
//!   or ordinal-default) surfaces as a clean [`keel_core::KeelError::Validation`]. This is what
//!   makes a second identical call "idempotent-ish": it collides on the name and errors.
//! - **multi-repo**: render `blueprints/services/{tag}-{lang}` with the v3 service context and
//!   create ONE new repo `{project}-{name}` (reusing the multi.rs single-repo path), with the
//!   branch model + the committed `branch-protection.json` governance record.
//! - **monolith**: read `keel.services.json` from the project repo, append the new entry, render
//!   the service with the monolith context (mono.rs strip/prefix rules), and push ONE commit to
//!   `dev` carrying the service tree + the updated manifest.
//! - Emits four [`ProgressEvent`]s with keys `form, render, create_repo|commit, register`.
//! - The project's catalog row (when one exists) is updated: the new repo appended (multi) and
//!   the add-service events appended to the audit trail (either way).

use std::path::Path;

use keel_blueprint::{derive_context_v3, ServiceCtx};
use keel_core::{
    InitRequest, KeelError, ProgressEvent, RenderedFile, RepoCoordinates, RepoLayout, RepoProvider,
    Result, ServiceEntry, ServiceSelection, ServicesManifest, Status,
};
use serde::{Deserialize, Serialize};

use super::{ensure_branches_and_protection, mono, multi, resolve_services};
use crate::catalog;

/// The integration branch a monolith add-service commit lands on (promotion to `main` flows
/// through the normal governance).
const INTEGRATION_BRANCH: &str = "dev";

/// The result of one add-service materialization (SPEC §19.3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AddServiceOutcome {
    /// The resolved component name (explicit name, or the ordinal default).
    pub name: String,
    /// The service directory/repo-suffix identity (`name`; a monolith materializes it under
    /// `services/{dir}/`). Matches `ServiceEntry::dir` / the hub's `OverviewService.dir`.
    pub dir: String,
    /// The newly created repository (multi-repo layout only; `None` on a monolith commit).
    pub repo: Option<RepoCoordinates>,
    /// The four `form, render, create_repo|commit, register` progress events.
    pub events: Vec<ProgressEvent>,
}

/// Everything [`crate::Engine::add_service`] needs to know about the addition (bundled so the
/// call surface stays clippy-clean and extensible).
#[derive(Debug, Clone, Copy)]
pub struct AddServiceSpec<'a> {
    /// The project's slug — repo prefix for multi-repo (`{project}-{name}`) and the monolith
    /// repo/manifest identity.
    pub project_slug: &'a str,
    /// The project's layout (decides materialization: new repo vs monolith commit).
    pub layout: RepoLayout,
    /// The service to add (`type` + `lang` + optional explicit `name`).
    pub selection: &'a ServiceSelection,
    /// Final names of the project's EXISTING services (the merged collision domain).
    pub existing_names: &'a [String],
    /// The project repository to read/commit against — **required** for monolith layout,
    /// ignored for multi-repo.
    pub base_repo: Option<&'a RepoCoordinates>,
    /// A request-shaped context donor (department/users/description/author) for template
    /// rendering and manifest validation; `project_name`/`layout`/`services` are overridden.
    pub request: &'a InitRequest,
}

/// Step titles for the four add-service events (index = step - 1; step 3 varies by layout).
const ADD_STEP_TITLES: [&str; 4] = [
    "Validate service",
    "Render blueprint",
    "Materialize service",
    "Register service",
];

/// Collects the add-service events while forwarding each live (same shape as the init EventLog,
/// but keyed on the 4-step `form/render/create_repo|commit/register` vocabulary).
struct AddLog<'a> {
    events: Vec<ProgressEvent>,
    on_event: &'a mut dyn FnMut(&ProgressEvent),
}

impl<'a> AddLog<'a> {
    fn new(on_event: &'a mut dyn FnMut(&ProgressEvent)) -> Self {
        Self {
            events: Vec::with_capacity(ADD_STEP_TITLES.len()),
            on_event,
        }
    }

    fn record(&mut self, step: u8, key: &str, status: Status, detail: impl Into<String>) {
        let idx = usize::from(step.saturating_sub(1)).min(ADD_STEP_TITLES.len() - 1);
        self.events.push(ProgressEvent::new(
            step,
            key,
            ADD_STEP_TITLES[idx],
            status,
            detail,
        ));
        if let Some(event) = self.events.last() {
            (self.on_event)(event);
        }
    }
}

/// Run the add-service workflow (see module docs).
///
/// # Errors
/// [`KeelError::Validation`] on a name collision, invalid input, or missing blueprint/manifest;
/// render and provider errors propagate as their respective [`KeelError`] variants.
pub(crate) fn run(
    spec: &AddServiceSpec<'_>,
    owner: &str,
    blueprints_dir: &Path,
    catalog_path: &Path,
    provider: &dyn RepoProvider,
    on_event: &mut dyn FnMut(&ProgressEvent),
) -> Result<AddServiceOutcome> {
    let mut log = AddLog::new(on_event);
    let selection = spec.selection;
    let tag = selection.service_type.tag();
    let lang = &selection.language;

    // ── Step 1: form — resolve the final name against the existing set ──────
    if !keel_core::is_valid_project_name(spec.project_slug) {
        return Err(KeelError::Validation(format!(
            "project slug {:?} must match {}",
            spec.project_slug,
            keel_core::PROJECT_NAME_PATTERN
        )));
    }
    let name = resolve_added_name(selection, spec.existing_names)?;

    // Build the one-service request the shared v3 helpers understand, and validate it against
    // the service blueprint's manifest (also proves the blueprint exists).
    let svc_req = InitRequest {
        project_name: spec.project_slug.to_owned(),
        layout: spec.layout,
        services: vec![selection.clone()],
        ..spec.request.clone()
    };
    svc_req.validate_basic()?;
    let plans = resolve_services(&svc_req, blueprints_dir)?;
    let Some(plan) = plans.first() else {
        // Unreachable: svc_req.services is exactly one selection.
        return Err(KeelError::Validation(
            "add-service requires exactly one service selection".to_owned(),
        ));
    };
    keel_blueprint::validate_request(&plan.manifest, &svc_req)?;
    log.record(
        1,
        "form",
        Status::Done,
        format!("resolved {tag}:{lang} as service {name:?}"),
    );

    // ── Step 2: render — the service's own tree with its v3 context ─────────
    let ctx = ServiceCtx {
        tag: tag.to_owned(),
        dir: name.clone(),
        lang: lang.clone(),
        label: selection.service_type.label().to_owned(),
        repo_name: format!("{}-{name}", spec.project_slug),
    };
    let ctxs = vec![ctx.clone()];
    let context = derive_context_v3(&svc_req, Some(&ctx), &ctxs);
    let rendered = keel_blueprint::render_with_context(&plan.manifest, &plan.dir, &context)?;
    log.record(
        2,
        "render",
        Status::Done,
        format!(
            "rendered {} file(s) from {}",
            rendered.len(),
            plan.blueprint_name
        ),
    );

    // ── Step 3: materialize (create_repo | commit) ───────────────────────────
    let repo = match spec.layout {
        RepoLayout::MultiRepo => Some(materialize_multi(
            &svc_req, plan, &ctx, rendered, owner, provider, &mut log,
        )?),
        RepoLayout::Monolith => {
            materialize_mono(spec, &name, selection, rendered, provider, &mut log)?;
            None
        }
    };

    // ── Step 4: register — update the project's catalog row when one exists ─
    register_in_catalog(catalog_path, spec.project_slug, repo.as_ref(), &mut log)?;

    let events = log.events;
    Ok(AddServiceOutcome {
        dir: name.clone(),
        name,
        repo,
        events,
    })
}

/// Resolve the added service's final name: existing names enter as explicit entries, the new
/// selection is the tail, and [`keel_core::resolve_service_names`] does the rest — explicit
/// names win, an unnamed addition gets its type tag, and ANY collision is a Validation error.
fn resolve_added_name(selection: &ServiceSelection, existing: &[String]) -> Result<String> {
    let mut combined: Vec<ServiceSelection> = existing
        .iter()
        .map(|n| ServiceSelection {
            service_type: selection.service_type,
            language: selection.language.clone(),
            name: Some(n.clone()),
        })
        .collect();
    combined.push(selection.clone());
    let names = keel_core::resolve_service_names(&combined)?;
    names.last().cloned().ok_or_else(|| {
        // Unreachable: `combined` always carries at least the new selection.
        KeelError::Validation("service name resolution produced no name".to_owned())
    })
}

/// Multi-repo materialization: ONE new repo `{project}-{name}` via the shared multi.rs path
/// (idempotency here is a *collision*: the repo pre-existing is an error, not a skip).
fn materialize_multi(
    svc_req: &InitRequest,
    plan: &super::ServicePlan,
    ctx: &ServiceCtx,
    mut files: Vec<RenderedFile>,
    owner: &str,
    provider: &dyn RepoProvider,
    log: &mut AddLog<'_>,
) -> Result<RepoCoordinates> {
    if provider.repo_exists(owner, &ctx.repo_name)? {
        return Err(KeelError::Validation(format!(
            "repository {owner}/{} already exists (service name collision)",
            ctx.repo_name
        )));
    }
    files.push(super::branch_protection_file(&plan.manifest)?);
    let repo_spec = multi::service_repo_spec(svc_req, owner, plan, ctx, files);
    let mut repo = provider.create_repo(&repo_spec)?;
    let protected = ensure_branches_and_protection(provider, &mut repo, &plan.manifest)?;
    log.record(
        3,
        "create_repo",
        Status::Done,
        format!(
            "created {} ({} branch(es), {protected} protection policy(ies))",
            repo.html_url,
            repo.branches.len()
        ),
    );
    Ok(repo)
}

/// Monolith materialization: append to `keel.services.json` and push ONE commit to `dev` with
/// the composed service tree + the updated manifest.
fn materialize_mono(
    spec: &AddServiceSpec<'_>,
    name: &str,
    selection: &ServiceSelection,
    rendered: Vec<RenderedFile>,
    provider: &dyn RepoProvider,
    log: &mut AddLog<'_>,
) -> Result<()> {
    let Some(base) = spec.base_repo else {
        return Err(KeelError::Validation(
            "monolith add-service requires the project repository coordinates (base_repo)"
                .to_owned(),
        ));
    };

    // The manifest is read from the integration branch (so successive adds compound), falling
    // back to the default branch for repos that predate the dev rail.
    let raw = match provider.read_file(base, INTEGRATION_BRANCH, "keel.services.json")? {
        Some(bytes) => bytes,
        None => provider
            .read_file(base, &base.default_branch, "keel.services.json")?
            .ok_or_else(|| {
                KeelError::Validation(format!(
                    "keel.services.json not found in {}/{} — is this a Keel monolith?",
                    base.owner, base.name
                ))
            })?,
    };
    let mut manifest: ServicesManifest = serde_json::from_slice(&raw).map_err(|e| {
        KeelError::Validation(format!(
            "keel.services.json in {}/{} is unparseable: {e}",
            base.owner, base.name
        ))
    })?;
    if manifest.services.iter().any(|s| s.dir == name) {
        return Err(KeelError::Validation(format!(
            "duplicate service name {name:?}: keel.services.json already has that dir"
        )));
    }
    manifest.services.push(ServiceEntry {
        dir: name.to_owned(),
        service_type: selection.service_type,
        language: selection.language.clone(),
        name: selection.service_type.label().to_owned(),
        depends_on: Vec::new(),
    });

    // Strip root-owned files, prefix services/{name}/, and carry the updated manifest along.
    let mut files = mono::compose_service_files(rendered, name);
    files.push(RenderedFile {
        path: "keel.services.json".to_owned(),
        contents: manifest.to_json()?,
    });

    let message = format!(
        "feat: add service {name} ({}:{})",
        selection.service_type.tag(),
        selection.language
    );
    provider.push_files(base, INTEGRATION_BRANCH, &files, &message)?;
    log.record(
        3,
        "commit",
        Status::Done,
        format!(
            "pushed services/{name} + keel.services.json to {INTEGRATION_BRANCH} ({} file(s))",
            files.len()
        ),
    );
    Ok(())
}

/// Update the project's catalog row when one exists: append the new repo (multi) and the
/// add-service events (audit trail, either layout). No row is not an error — catalog-less
/// invocations (e.g. a fresh `--local` target) still succeed, with the step `Skipped`.
fn register_in_catalog(
    catalog_path: &Path,
    project_slug: &str,
    repo: Option<&RepoCoordinates>,
    log: &mut AddLog<'_>,
) -> Result<()> {
    let rows = catalog::read(catalog_path)?;
    let Some(mut row) = rows.into_iter().find(|r| r.project == project_slug) else {
        log.record(
            4,
            "register",
            Status::Skipped,
            format!("no catalog row for {project_slug}"),
        );
        return Ok(());
    };
    if let Some(new_repo) = repo {
        if !row.repos.iter().any(|r| r.name == new_repo.name) {
            row.repos.push(new_repo.clone());
        }
    }
    log.record(
        4,
        "register",
        Status::Done,
        format!("updated catalog row {}", row.catalog_id),
    );
    row.events.extend(log.events.iter().cloned());
    catalog::upsert(catalog_path, &row)?;
    Ok(())
}
