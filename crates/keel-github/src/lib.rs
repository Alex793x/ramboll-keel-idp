//! # keel-github
//!
//! [`keel_core::RepoProvider`] implementations:
//! - [`OctocrabProvider`] — the typed-SDK provider (whitepaper Appendix A). Creates the repo, pushes a
//!   single clean commit via the Git Data API, creates `dev`/`staging`, and applies branch protection
//!   (best-effort) — all through `octocrab`. Auth via a user token (from `gh auth token` in the MVP).
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
mod octocrab_provider;

pub use gh::GhCliProvider;
pub use local::LocalDirProvider;
pub use octocrab_provider::OctocrabProvider;

// Re-exported so the integration-test / argv-helper surface is documented & testable.
pub use gh::build_repo_create_argv;

// ─────────────────────────────────────────────────────────────────────────────
// Fake provider (in-memory) — complete; the engine's tests depend on it.
// ─────────────────────────────────────────────────────────────────────────────

/// An in-memory fake that records everything it is asked to do, so engine workflow logic can be
/// unit/property-tested deterministically and offline.
///
/// v5: also implements [`RepoProvider::read_file`] / [`RepoProvider::push_files`]. Files from
/// `create_repo` count as the **default branch's** tree; `push_files` overlays a per-branch tree
/// (branched from the default tree on first push); every push is recorded and exposed via
/// [`FakeProvider::pushed`] for assertions.
#[derive(Debug, Default)]
pub struct FakeProvider {
    repos: RefCell<Vec<RepoCoordinates>>,
    /// Default-branch tree per `owner/name` (what `create_repo` committed).
    files: RefCell<HashMap<String, Vec<RenderedFile>>>,
    /// Per-branch overlay trees, keyed `owner/name#branch` (only branches that were pushed to).
    branch_files: RefCell<HashMap<String, Vec<RenderedFile>>>,
    protections: RefCell<Vec<ProtectionPolicy>>,
    /// Every `push_files` call: `(owner/name, branch, message)`, in order.
    pushes: RefCell<Vec<(String, String, String)>>,
}

impl FakeProvider {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    fn key(owner: &str, name: &str) -> String {
        format!("{owner}/{name}")
    }

    fn branch_key(owner: &str, name: &str, branch: &str) -> String {
        format!("{owner}/{name}#{branch}")
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

    /// The effective tree of `<owner>/<name>` at `branch`: the pushed overlay when one exists,
    /// otherwise the default-branch tree (every branch forks from the default branch).
    #[must_use]
    pub fn files_on(&self, owner: &str, name: &str, branch: &str) -> Vec<RenderedFile> {
        if let Some(tree) = self
            .branch_files
            .borrow()
            .get(&Self::branch_key(owner, name, branch))
        {
            return tree.clone();
        }
        self.files_for(owner, name)
    }

    /// Every `push_files` call so far, as `(repo "owner/name", branch, message)` in call order.
    #[must_use]
    pub fn pushed(&self) -> Vec<(String, String, String)> {
        self.pushes.borrow().clone()
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

    fn read_file(
        &self,
        repo: &RepoCoordinates,
        branch: &str,
        path: &str,
    ) -> Result<Option<Vec<u8>>> {
        if !self.repo_exists(&repo.owner, &repo.name)? {
            return Err(keel_core::KeelError::Github(format!(
                "read_file: repo {}/{} not created",
                repo.owner, repo.name
            )));
        }
        let tree = self.files_on(&repo.owner, &repo.name, branch);
        Ok(tree
            .iter()
            .find(|f| f.path == path)
            .map(|f| f.contents.clone()))
    }

    fn push_files(
        &self,
        repo: &RepoCoordinates,
        branch: &str,
        files: &[RenderedFile],
        message: &str,
    ) -> Result<()> {
        if !self.repo_exists(&repo.owner, &repo.name)? {
            return Err(keel_core::KeelError::Github(format!(
                "push_files: repo {}/{} not created",
                repo.owner, repo.name
            )));
        }
        // Start from the branch's current tree (default tree on first push), then upsert by path
        // — push_files overwrites paths but never deletes, like a real commit of these files.
        let mut tree = self.files_on(&repo.owner, &repo.name, branch);
        for f in files {
            match tree.iter_mut().find(|existing| existing.path == f.path) {
                Some(existing) => *existing = f.clone(),
                None => tree.push(f.clone()),
            }
        }
        self.branch_files
            .borrow_mut()
            .insert(Self::branch_key(&repo.owner, &repo.name, branch), tree);
        self.pushes.borrow_mut().push((
            Self::key(&repo.owner, &repo.name),
            branch.to_owned(),
            message.to_owned(),
        ));
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

    // ── v5: read_file / push_files round-trip ───────────────────────────────

    #[test]
    fn fake_read_and_push_round_trip_per_branch() {
        let p = FakeProvider::new();
        let r = p.create_repo(&spec("o", "r")).unwrap();

        // create_repo files count as the default branch's tree — readable on ANY branch that
        // has no pushes yet (branches fork from the default branch).
        assert_eq!(
            p.read_file(&r, "main", "README.md").unwrap().as_deref(),
            Some(b"# hi".as_slice())
        );
        assert_eq!(
            p.read_file(&r, "dev", "README.md").unwrap().as_deref(),
            Some(b"# hi".as_slice())
        );
        assert_eq!(p.read_file(&r, "main", "nope.txt").unwrap(), None);

        // Push to dev: upserts README, adds a new file; main stays untouched.
        p.push_files(
            &r,
            "dev",
            &[
                RenderedFile::text("README.md", "# updated"),
                RenderedFile::text("services/ingest/main.py", "print()\n"),
            ],
            "feat: add service ingest (api:python)",
        )
        .unwrap();

        assert_eq!(
            p.read_file(&r, "dev", "README.md").unwrap().as_deref(),
            Some(b"# updated".as_slice())
        );
        assert_eq!(
            p.read_file(&r, "dev", "services/ingest/main.py")
                .unwrap()
                .as_deref(),
            Some(b"print()\n".as_slice())
        );
        assert_eq!(
            p.read_file(&r, "main", "README.md").unwrap().as_deref(),
            Some(b"# hi".as_slice()),
            "main untouched by the dev push"
        );
        assert_eq!(
            p.read_file(&r, "main", "services/ingest/main.py").unwrap(),
            None
        );

        // pushed() exposes (repo, branch, message) for assertions.
        assert_eq!(
            p.pushed(),
            vec![(
                "o/r".to_owned(),
                "dev".to_owned(),
                "feat: add service ingest (api:python)".to_owned()
            )]
        );
    }

    #[test]
    fn fake_read_and_push_error_on_missing_repo() {
        let p = FakeProvider::new();
        let ghost = RepoCoordinates {
            owner: "o".into(),
            name: "ghost".into(),
            html_url: String::new(),
            default_branch: "main".into(),
            branches: vec!["main".into()],
        };
        assert!(p.read_file(&ghost, "main", "x").is_err());
        assert!(p
            .push_files(&ghost, "dev", &[RenderedFile::text("x", "y")], "m")
            .is_err());
    }
}
