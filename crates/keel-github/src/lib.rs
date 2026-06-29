//! # keel-github
//!
//! [`keel_core::RepoProvider`] implementations:
//! - [`GhCliProvider`] — the real one. Renders to a temp dir, `git init -b main`, commits, and runs
//!   `gh repo create <owner>/<name> --private --source . --remote origin --push`; then creates
//!   `dev`/`staging` and (best-effort) applies branch protection via `gh api`. Idempotent.
//! - [`LocalDirProvider`] — writes the repo to a local directory (`git init -b main` + commit +
//!   local `dev`/`staging` branches), with **no `gh` and no network**. This is what powers
//!   hermetic, green-from-birth testing (the CLI `--local` mode and CI). `html_url` is a `file://`
//!   path. Additive type — not part of the frozen Phase-0 surface.
//! - [`FakeProvider`] — in-memory, deterministic, for unit/property tests of the engine. **Fully
//!   implemented in Phase 0** so the engine is testable without GitHub.
//!
//! > `Fleet-Github-RS` owns this crate and implements [`GhCliProvider`] + [`LocalDirProvider`] and
//! > their tests. Do **not** change the public signatures or break [`FakeProvider`].

#![forbid(unsafe_code)]

use std::cell::RefCell;
use std::collections::HashMap;

use keel_core::{ProtectionPolicy, RenderedFile, RepoCoordinates, RepoProvider, RepoSpec, Result};

mod cmd;
mod gh;
mod local;

pub use gh::GhCliProvider;
pub use local::LocalDirProvider;

// Re-exported so the integration-test / argv-helper surface is documented & testable.
pub use gh::build_repo_create_argv;

// ─────────────────────────────────────────────────────────────────────────────
// Fake provider (in-memory) — complete; the engine's tests depend on it.
// ─────────────────────────────────────────────────────────────────────────────

/// An in-memory fake that records everything it is asked to do, so engine workflow logic can be
/// unit/property-tested deterministically and offline.
#[derive(Debug, Default)]
pub struct FakeProvider {
    repos: RefCell<Vec<RepoCoordinates>>,
    files: RefCell<HashMap<String, Vec<RenderedFile>>>,
    protections: RefCell<Vec<ProtectionPolicy>>,
}

impl FakeProvider {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    fn key(owner: &str, name: &str) -> String {
        format!("{owner}/{name}")
    }

    /// Repositories created so far.
    #[must_use]
    pub fn created(&self) -> Vec<RepoCoordinates> {
        self.repos.borrow().clone()
    }

    /// The file set pushed for `<owner>/<name>` (empty if none).
    #[must_use]
    pub fn files_for(&self, owner: &str, name: &str) -> Vec<RenderedFile> {
        self.files
            .borrow()
            .get(&Self::key(owner, name))
            .cloned()
            .unwrap_or_default()
    }

    /// Branch-protection policies recorded so far.
    #[must_use]
    pub fn protections(&self) -> Vec<ProtectionPolicy> {
        self.protections.borrow().clone()
    }
}

impl RepoProvider for FakeProvider {
    fn repo_exists(&self, owner: &str, name: &str) -> Result<bool> {
        Ok(self
            .repos
            .borrow()
            .iter()
            .any(|r| r.owner == owner && r.name == name))
    }

    fn create_repo(&self, spec: &RepoSpec) -> Result<RepoCoordinates> {
        // Idempotent: creating an existing repo returns the existing coordinates unchanged.
        if let Some(existing) = self
            .repos
            .borrow()
            .iter()
            .find(|r| r.owner == spec.owner && r.name == spec.name)
        {
            return Ok(existing.clone());
        }
        let coords = RepoCoordinates {
            owner: spec.owner.clone(),
            name: spec.name.clone(),
            html_url: format!("https://github.com/{}/{}", spec.owner, spec.name),
            default_branch: spec.default_branch.clone(),
            branches: vec![spec.default_branch.clone()],
        };
        self.files
            .borrow_mut()
            .insert(Self::key(&spec.owner, &spec.name), spec.files.clone());
        self.repos.borrow_mut().push(coords.clone());
        Ok(coords)
    }

    fn ensure_branches(&self, repo: &RepoCoordinates, branches: &[String]) -> Result<()> {
        let mut repos = self.repos.borrow_mut();
        let Some(stored) = repos
            .iter_mut()
            .find(|r| r.owner == repo.owner && r.name == repo.name)
        else {
            return Err(keel_core::KeelError::Github(format!(
                "ensure_branches: repo {}/{} not created",
                repo.owner, repo.name
            )));
        };
        for b in branches {
            if !stored.branches.contains(b) {
                stored.branches.push(b.clone());
            }
        }
        Ok(())
    }

    fn write_protection(&self, _repo: &RepoCoordinates, policy: &ProtectionPolicy) -> Result<()> {
        self.protections.borrow_mut().push(policy.clone());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(owner: &str, name: &str) -> RepoSpec {
        RepoSpec {
            owner: owner.into(),
            name: name.into(),
            description: "d".into(),
            private: true,
            default_branch: "main".into(),
            files: vec![RenderedFile::text("README.md", "# hi")],
            commit_message: "chore: scaffold".into(),
        }
    }

    #[test]
    fn create_is_idempotent_and_records_files() {
        let p = FakeProvider::new();
        let a = p.create_repo(&spec("o", "r")).unwrap();
        let b = p.create_repo(&spec("o", "r")).unwrap();
        assert_eq!(a, b);
        assert_eq!(p.created().len(), 1);
        assert_eq!(p.files_for("o", "r").len(), 1);
        assert!(p.repo_exists("o", "r").unwrap());
    }

    #[test]
    fn ensure_branches_unions() {
        let p = FakeProvider::new();
        let r = p.create_repo(&spec("o", "r")).unwrap();
        p.ensure_branches(&r, &["dev".into(), "staging".into(), "main".into()])
            .unwrap();
        let stored = p.created().pop().unwrap();
        assert_eq!(stored.branches, vec!["main", "dev", "staging"]);
    }
}
