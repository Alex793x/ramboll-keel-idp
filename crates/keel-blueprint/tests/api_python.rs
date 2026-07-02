//! Integration test: load and render the REAL `blueprints/services/api-python` blueprint — the
//! Python API golden path. This is the v3 building block that replaced the retired top-level
//! `python-service`, so this test proves the renderer works end-to-end against a shipped service
//! blueprint using **v3 context** (`service` + `layout`), including the frozen verbatim/`.j2` rules.

use std::path::PathBuf;

use keel_blueprint::{
    derive_context_v3, load_manifest, render_with_context, validate_request, ServiceCtx,
};
use keel_core::{
    Department, InitRequest, RenderedFile, RepoLayout, ServiceKind, ServiceSelection, User,
};

fn blueprint_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../blueprints/services/api-python")
}

fn sample_request() -> InitRequest {
    InitRequest {
        project_name: "invoicing-api".into(),
        blueprint: "api-python".into(),
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
        layout: RepoLayout::default(),
        services: vec![ServiceSelection::parse("api:python").expect("valid selection")],
    }
}

/// The service context the engine would build for this single `api:python` selection.
fn service_ctx() -> ServiceCtx {
    ServiceCtx {
        tag: "api".into(),
        dir: "api".into(),
        lang: "python".into(),
        label: "Backend API".into(),
        repo_name: "invoicing-api-api".into(),
    }
}

fn find<'a>(files: &'a [RenderedFile], path: &str) -> Option<&'a RenderedFile> {
    files.iter().find(|f| f.path == path)
}

#[test]
fn renders_real_api_python_blueprint() {
    let dir = blueprint_dir();
    assert!(
        dir.is_dir(),
        "real blueprint dir not found at {}",
        dir.display()
    );

    let manifest = load_manifest(&dir).expect("manifest loads");
    let req = sample_request();
    validate_request(&manifest, &req).expect("request validates against manifest");

    let svc = service_ctx();
    let ctx = derive_context_v3(&req, Some(&svc), std::slice::from_ref(&svc));
    let files = render_with_context(&manifest, &dir, &ctx).expect("blueprint renders");
    assert!(!files.is_empty(), "no files rendered");

    // ── CODEOWNERS — this service blueprint owns by the selected users' github_login. ──
    let codeowners = find(&files, "CODEOWNERS").expect("CODEOWNERS must exist");
    let co = String::from_utf8_lossy(&codeowners.contents);
    for u in &req.users {
        assert!(
            co.contains(&u.github_login),
            "CODEOWNERS must list selected owner @{}",
            u.github_login
        );
    }

    // ── The three embedded AI agent skills. ──
    for skill in [
        ".claude/skills/property-based-testing/SKILL.md",
        ".claude/skills/git-ci-governance/SKILL.md",
        ".claude/skills/python-clean-code/SKILL.md",
    ] {
        assert!(find(&files, skill).is_some(), "missing skill file {skill}");
    }

    // ── Three GitHub workflows, copied VERBATIM, each referencing the reusable workflow. ──
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
        let body = String::from_utf8_lossy(&rendered.contents);
        assert!(
            body.contains("uses:") && body.contains("reusable-"),
            "{wf} must reference the reusable workflow via `uses: .../reusable-*.yml@…`"
        );
    }

    // ── Package source exists with the interpolated package path. ──
    assert!(
        find(&files, "src/invoicing_api/core.py").is_some(),
        "missing src/invoicing_api/core.py"
    );

    // No `.j2` suffix may leak into the rendered output.
    assert!(
        files.iter().all(|f| !f.path.ends_with(".j2")),
        "a .j2 suffix leaked through"
    );
}
