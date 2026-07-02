//! The v3 monolith path (SPEC §12): ONE repo named `{project_name}` composing every service.
//!
//! The committed file set is composed from:
//! 1. `blueprints/monolith-root/` rendered with the root context (`services` array populated) —
//!    the root blueprint owns CI, CODEOWNERS, skills, and docs;
//! 2. each service blueprint rendered with its own context, minus the **root-owned** files
//!    (paths under `.github/` or `.claude/`, and `LICENSE`/`SECURITY.md`/`CODEOWNERS`/
//!    `CONTRIBUTING.md`), the remainder prefixed `services/{dir}/`;
//! 3. the engine-serialized `keel.services.json` ([`keel_core::ServicesManifest`] — structurally
//!    guaranteed, never a template);
//! 4. the committed `branch-protection.json` governance record (from the root manifest).
//!
//! Create/commit/branches/protection run against the single repo with the same idempotent
//! semantics as the legacy path (steps 4+5 `Skipped` when the repo already exists).

use std::path::Path;

use keel_blueprint::derive_context_v3;
use keel_core::{
    InitOutcome, InitRequest, KeelError, ProgressEvent, RenderedFile, RepoCoordinates,
    RepoProvider, RepoSpec, Result, ServicesManifest, Status,
};

use super::{
    branch_protection_file, build_service_ctxs, default_branch, ensure_branches_and_protection,
    resolve_services, EventLog,
};
use crate::catalog;

/// Directory of the monolith root blueprint, a sibling of `services/` under the blueprints dir.
const MONOLITH_ROOT: &str = "monolith-root";

/// Path prefixes owned by the monolith root — dropped from every service render.
const ROOT_OWNED_PREFIXES: [&str; 2] = [".github/", ".claude/"];
/// Repo-root files owned by the monolith root — dropped from every service render.
const ROOT_OWNED_FILES: [&str; 4] = ["LICENSE", "SECURITY.md", "CODEOWNERS", "CONTRIBUTING.md"];

/// Run the monolith workflow (`services` non-empty, `layout = monolith`).
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
    req.validate_basic()?;
    let root_dir = blueprints_dir.join(MONOLITH_ROOT);
    if !root_dir.is_dir() {
        return Err(KeelError::Validation(format!(
            "monolith root blueprint missing: {} (expected a sibling of {}/services)",
            root_dir.display(),
            blueprints_dir.display(),
        )));
    }
    let root_manifest = keel_blueprint::load_manifest(&root_dir)?;
    keel_blueprint::validate_request(&root_manifest, req)?;
    let plans = resolve_services(req, blueprints_dir)?;
    for plan in &plans {
        keel_blueprint::validate_request(&plan.manifest, req)?;
    }
    log.record(
        2,
        Status::Done,
        format!(
            "validated monolith root + {} service blueprint(s)",
            plans.len()
        ),
    );

    // ── Step 3: render + compose ─────────────────────────────────────────────
    let ctxs = build_service_ctxs(req);
    let root_ctx = derive_context_v3(req, None, &ctxs);
    let mut files = keel_blueprint::render_with_context(&root_manifest, &root_dir, &root_ctx)?;
    for (plan, ctx) in plans.iter().zip(&ctxs) {
        let svc_ctx = derive_context_v3(req, Some(ctx), &ctxs);
        let rendered = keel_blueprint::render_with_context(&plan.manifest, &plan.dir, &svc_ctx)?;
        files.extend(compose_service_files(rendered, &ctx.dir));
    }
    // The machine-readable service registry, serialized by the ENGINE (never a template).
    files.push(services_manifest_file(req)?);
    // Durable governance record, from the root manifest (the root owns protection intent).
    files.push(branch_protection_file(&root_manifest)?);
    log.record(
        3,
        Status::Done,
        format!(
            "rendered {} file(s) (root + {} service(s))",
            files.len(),
            plans.len()
        ),
    );

    // ── Step 4 + 5: create_repo + commit (single repo, legacy semantics) ────
    let name = &req.project_name;
    let already_exists = provider.repo_exists(owner, name)?;
    let branch = default_branch(&root_manifest);
    let spec = RepoSpec {
        owner: owner.to_owned(),
        name: name.clone(),
        description: req.description.clone(),
        private: true,
        default_branch: branch.clone(),
        files,
        commit_message: "chore: scaffold Keel monolith from service blueprints".to_owned(),
    };

    let mut repo: RepoCoordinates = if already_exists {
        log.record(4, Status::Skipped, format!("{owner}/{name} already exists"));
        log.record(5, Status::Skipped, "initial commit already present");
        // The provider's create_repo is idempotent: a safe way to fetch existing coordinates.
        provider.create_repo(&spec)?
    } else {
        let coords = provider.create_repo(&spec)?;
        log.record(4, Status::Done, format!("created {}", coords.html_url));
        log.record(
            5,
            Status::Done,
            format!("one clean initial commit on {branch}"),
        );
        coords
    };

    // ── Step 6: branches ─────────────────────────────────────────────────────
    let protected = ensure_branches_and_protection(provider, &mut repo, &root_manifest)?;
    log.record(
        6,
        Status::Done,
        format!(
            "{} branch(es), {protected} protection policy(ies)",
            repo.branches.len()
        ),
    );

    // ── Step 7: seed_ci ──────────────────────────────────────────────────────
    log.record(7, Status::Done, "CI + docs included in rendered tree");

    // ── Step 8: register ─────────────────────────────────────────────────────
    let catalog_id = catalog::catalog_id(owner, name);
    log.record(
        8,
        Status::Done,
        format!("upserted catalog row {catalog_id}"),
    );

    let outcome = InitOutcome {
        project: name.clone(),
        repos: vec![repo.clone()],
        repo,
        docs_path: format!("{name}/docs"),
        blueprint_version: root_manifest.version.clone(),
        catalog_id,
        events: log.into_events(),
    };
    catalog::upsert(catalog_path, &outcome)?;
    Ok(outcome)
}

/// Drop root-owned files from one service's render and prefix the rest with `services/{dir}/`.
fn compose_service_files(rendered: Vec<RenderedFile>, dir: &str) -> Vec<RenderedFile> {
    rendered
        .into_iter()
        .filter(|f| !is_root_owned(&f.path))
        .map(|mut f| {
            f.path = format!("services/{dir}/{}", f.path);
            f
        })
        .collect()
}

/// True when a service-rendered path is owned by the monolith root (and must be dropped).
fn is_root_owned(path: &str) -> bool {
    ROOT_OWNED_PREFIXES.iter().any(|p| path.starts_with(p)) || ROOT_OWNED_FILES.contains(&path)
}

/// The engine-serialized `keel.services.json` (structurally guaranteed via serde).
fn services_manifest_file(req: &InitRequest) -> Result<RenderedFile> {
    let manifest = ServicesManifest::new(&req.project_name, &req.services);
    Ok(RenderedFile {
        path: "keel.services.json".to_owned(),
        contents: manifest.to_json()?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_owned_rules_match_spec() {
        assert!(is_root_owned(".github/workflows/ci.yml"));
        assert!(is_root_owned(".claude/skills/x.md"));
        assert!(is_root_owned("LICENSE"));
        assert!(is_root_owned("SECURITY.md"));
        assert!(is_root_owned("CODEOWNERS"));
        assert!(is_root_owned("CONTRIBUTING.md"));
        // Nested files with root-owned NAMES are kept (only exact root-level matches drop).
        assert!(!is_root_owned("docs/LICENSE"));
        assert!(!is_root_owned("src/app/main.py"));
        assert!(!is_root_owned("README.md"));
    }

    #[test]
    fn compose_prefixes_and_filters() {
        let rendered = vec![
            RenderedFile::text("README.md", "# svc\n"),
            RenderedFile::text(".github/workflows/ci.yml", "verbatim\n"),
            RenderedFile::text("LICENSE", "x\n"),
            RenderedFile::text("src/main.py", "print()\n"),
        ];
        let composed = compose_service_files(rendered, "api-1");
        let paths: Vec<&str> = composed.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            paths,
            vec!["services/api-1/README.md", "services/api-1/src/main.py"]
        );
    }
}
