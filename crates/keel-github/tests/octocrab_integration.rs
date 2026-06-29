//! Real-network integration test for [`keel_github::OctocrabProvider`].
//!
//! Ignored by default (needs `gh auth token` + network). Run explicitly with:
//! `cargo test -p keel-github --test octocrab_integration -- --ignored`
//!
//! It is read-only — it only checks `repo_exists` against known-present and known-absent repos, so it
//! never creates or mutates anything on GitHub.

use keel_core::RepoProvider;
use keel_github::OctocrabProvider;

#[test]
#[ignore = "hits real GitHub via `gh auth token`; run with --ignored"]
fn repo_exists_classifies_present_and_absent() {
    let provider = OctocrabProvider::from_gh().expect("build OctocrabProvider from gh token");

    // A repository that exists.
    assert!(
        provider
            .repo_exists("rust-lang", "rust")
            .expect("repo_exists ok"),
        "rust-lang/rust should exist"
    );

    // A repository that (almost certainly) does not — must classify as absent, not error.
    assert!(
        !provider
            .repo_exists("Alex793x", "keel-nonexistent-repo-zzz-000")
            .expect("repo_exists must treat 404 as absent, not error"),
        "a missing repo must be reported absent"
    );
}
