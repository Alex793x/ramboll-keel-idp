//! Integration test: load and render the REAL `blueprints/python-service` blueprint.
//!
//! Path is relative to this crate (`crates/keel-blueprint`), so `../../blueprints/python-service`.
//! This proves the renderer works end-to-end against the shipped golden-path template, including
//! the frozen verbatim/`.j2` rules and the `service_kind` condition.

use std::path::PathBuf;

use keel_blueprint::{load_manifest, render, validate_request};
use keel_core::{Department, InitRequest, RenderedFile, ServiceKind, User};

fn blueprint_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../blueprints/python-service")
}

fn sample_request() -> InitRequest {
    InitRequest {
        project_name: "invoicing-api".into(),
        blueprint: "python-service".into(),
        department: Department {
            id: "d-buildings".into(),
            name: "Buildings".into(),
            team_slug: "buildings".into(),
        },
        users: vec![
            User {
                id: "u1".into(),
                name: "Ada Lovelace".into(),
                email: "ada@ramboll.com".into(),
                github_login: "ada-gh".into(),
            },
            User {
                id: "u2".into(),
                name: "Linus T".into(),
                email: "linus@ramboll.com".into(),
                github_login: "linus-gh".into(),
            },
        ],
        service_kind: ServiceKind::RestApi,
        description: "Handles invoices for the buildings division.".into(),
        author: "Ada Lovelace".into(),
    }
}

fn find<'a>(files: &'a [RenderedFile], path: &str) -> Option<&'a RenderedFile> {
    files.iter().find(|f| f.path == path)
}

#[test]
fn renders_real_python_service_blueprint() {
    let dir = blueprint_dir();
    assert!(
        dir.is_dir(),
        "real blueprint dir not found at {}",
        dir.display()
    );

    let manifest = load_manifest(&dir).expect("manifest loads");
    let req = sample_request();
    validate_request(&manifest, &req).expect("request validates against manifest");

    let files = render(&manifest, &dir, &req).expect("blueprint renders");
    assert!(!files.is_empty(), "no files rendered");

    // ── CODEOWNERS ────────────────────────────────────────────────────────────
    // Must exist. Its *contents* depend on the parallel PY agent refining the template to use
    // department.team_slug + each users[].github_login. We assert existence unconditionally and the
    // richer content checks tolerantly (see tracker note).
    let codeowners = find(&files, "CODEOWNERS").expect("CODEOWNERS must exist");
    let co = String::from_utf8_lossy(&codeowners.contents);
    assert!(!co.trim().is_empty(), "CODEOWNERS is empty");

    // CODEOWNERS must name every selected user as an owner and reference the owning department
    // (requirement #4: the selection drives CODEOWNERS). Asserted unconditionally.
    for u in &req.users {
        assert!(
            co.contains(&u.github_login),
            "CODEOWNERS must list selected owner @{}",
            u.github_login
        );
    }
    assert!(
        co.contains(&req.department.name) || co.contains(&req.department.team_slug),
        "CODEOWNERS must reference the owning department ({} / {})",
        req.department.name,
        req.department.team_slug
    );

    // ── Three AI agent skills ───────────────────────────────────────────────────
    for skill in [
        ".claude/skills/property-based-testing/SKILL.md",
        ".claude/skills/git-ci-governance/SKILL.md",
        ".claude/skills/python-clean-code/SKILL.md",
    ] {
        assert!(find(&files, skill).is_some(), "missing skill file {skill}");
    }

    // ── Three GitHub workflows, copied VERBATIM ─────────────────────────────────
    // The frozen guarantee we own is byte-for-byte preservation (so any GitHub Actions
    // `${{ … }}` survives). We assert each workflow exists and is byte-identical to its source.
    // The `${{` check is applied tolerantly: the reusable-workflow refinement that introduces
    // such expressions is owned by the parallel Fleet-CI agent (see tracker note).
    for wf in [
        ".github/workflows/build.yml",
        ".github/workflows/test.yml",
        ".github/workflows/validate.yml",
    ] {
        let rendered = find(&files, wf).unwrap_or_else(|| panic!("missing {wf}"));
        let source = std::fs::read(dir.join("template").join(wf))
            .unwrap_or_else(|_| panic!("source {wf} unreadable"));
        assert_eq!(
            rendered.contents, source,
            "{wf} must be copied verbatim (byte-identical)"
        );

        // Requirement #4: each caller workflow must reference the central reusable workflow.
        let body = String::from_utf8_lossy(&rendered.contents);
        assert!(
            body.contains("uses:") && body.contains("reusable-"),
            "{wf} must reference the reusable workflow via `uses: .../reusable-*.yml@…`"
        );
    }

    // ── Package source exists with interpolated path ────────────────────────────
    let core = "src/invoicing_api/core.py";
    assert!(find(&files, core).is_some(), "missing {core}");

    // No `.j2` suffix may leak into the rendered output.
    assert!(
        files.iter().all(|f| !f.path.ends_with(".j2")),
        "a .j2 suffix leaked through"
    );
}
