//! Real-`gh` integration test for [`keel_github::GhCliProvider`].
//!
//! This test hits the **live** GitHub API via the user's authenticated `gh` CLI: it creates a
//! throwaway private repo under the configured owner, asserts it exists + carries `dev`/`staging`,
//! then deletes it. It is therefore annotated `#[ignore]` so the default `cargo test` (and CI
//! without network/credentials) skips it.
//!
//! Run it explicitly:
//!
//! ```text
//! cargo test -p keel-github -- --ignored
//! ```
//!
//! Requirements: `gh auth status` is logged in with `repo` + `delete_repo` scopes. The orchestrator
//! runs the real end-to-end flow; do not run this from inside an unattended agent.

use keel_core::{RenderedFile, RepoProvider, RepoSpec};
use keel_github::GhCliProvider;

/// The GitHub account used for throwaway repos (matches SPEC §5 / §11 — `Alex793x`).
const OWNER: &str = "Alex793x";

fn run_gh(args: &[&str]) -> std::process::Output {
    std::process::Command::new("gh")
        .args(args)
        .output()
        .expect("spawn gh")
}

#[test]
#[ignore = "hits the live GitHub API via `gh`; run with --ignored"]
fn create_verify_delete_throwaway_repo() {
    // Unique-ish name so re-runs don't collide.
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let name = format!("keel-it-{suffix}");
    let slug = format!("{OWNER}/{name}");

    let provider = GhCliProvider::new(OWNER.to_owned());

    let spec = RepoSpec {
        owner: OWNER.to_owned(),
        name: name.clone(),
        description: "keel-github integration test — safe to delete".to_owned(),
        private: true,
        default_branch: "main".to_owned(),
        files: vec![
            RenderedFile::text("README.md", "# integration test\n"),
            RenderedFile::text(
                ".github/workflows/ci.yml",
                "on: push\njobs:\n  b:\n    runs-on: ${{ matrix.os }}\n",
            ),
        ],
        commit_message: "chore: keel integration test scaffold".to_owned(),
    };

    // create_repo
    let coords = provider.create_repo(&spec).expect("create_repo");
    assert_eq!(coords.owner, OWNER);
    assert_eq!(coords.name, name);
    assert!(
        coords.html_url.contains(&name),
        "html_url = {}",
        coords.html_url
    );

    // It now exists.
    assert!(provider.repo_exists(OWNER, &name).expect("repo_exists"));

    // Idempotency: a second create returns coordinates without erroring.
    let coords2 = provider.create_repo(&spec).expect("create_repo idempotent");
    assert_eq!(coords2.name, name);

    // ensure_branches (dev/staging via gh api)
    provider
        .ensure_branches(&coords, &["main".into(), "dev".into(), "staging".into()])
        .expect("ensure_branches");

    // Verify branches exist server-side.
    for branch in ["dev", "staging"] {
        let out = run_gh(&["api", &format!("repos/{slug}/git/ref/heads/{branch}")]);
        assert!(out.status.success(), "branch {branch} missing on {slug}");
    }

    // Cleanup — delete the throwaway repo. Best-effort but assert success so a leak is visible.
    let del = run_gh(&["repo", "delete", &slug, "--yes"]);
    assert!(
        del.status.success(),
        "failed to delete {slug}; delete manually: {}",
        String::from_utf8_lossy(&del.stderr)
    );
}
