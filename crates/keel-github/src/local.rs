//! [`LocalDirProvider`] — a hermetic [`RepoProvider`] that writes the repository to local disk and
//! creates real local `git` branches, with **no `gh` and no network**.
//!
//! This powers green-from-birth testing: the CLI `--local` mode and CI use it to produce a real,
//! commit-backed repo on disk that can be cloned/inspected and run through the blueprint's own
//! quality gate, without authenticating to GitHub. `create_repo` returns coordinates whose
//! `html_url` is a `file://` URL pointing at the on-disk repo.

use std::path::PathBuf;

use keel_core::{KeelError, ProtectionPolicy, RepoCoordinates, RepoProvider, RepoSpec, Result};

use crate::cmd;

/// Writes repositories to `<root>/<name>` on the local filesystem.
#[derive(Debug, Clone)]
pub struct LocalDirProvider {
    pub root: PathBuf,
}

impl LocalDirProvider {
    #[must_use]
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// On-disk path for `<name>` (the owner is irrelevant on local disk).
    fn repo_path(&self, name: &str) -> PathBuf {
        self.root.join(name)
    }

    /// `file://` URL for an on-disk path.
    fn file_url(path: &std::path::Path) -> String {
        format!("file://{}", path.display())
    }
}

impl RepoProvider for LocalDirProvider {
    fn repo_exists(&self, _owner: &str, name: &str) -> Result<bool> {
        Ok(self.repo_path(name).is_dir())
    }

    fn create_repo(&self, spec: &RepoSpec) -> Result<RepoCoordinates> {
        let path = self.repo_path(&spec.name);

        // Idempotent: an already-created repo is returned as-is.
        if path.is_dir() {
            return Ok(RepoCoordinates {
                owner: spec.owner.clone(),
                name: spec.name.clone(),
                html_url: Self::file_url(&path),
                default_branch: spec.default_branch.clone(),
                branches: vec![spec.default_branch.clone()],
            });
        }

        std::fs::create_dir_all(&path)
            .map_err(|e| KeelError::Io(format!("create repo dir {}: {e}", path.display())))?;
        cmd::write_files(&path, &spec.files)?;
        cmd::git_init_commit(&path, &spec.default_branch, &spec.commit_message)?;

        Ok(RepoCoordinates {
            owner: spec.owner.clone(),
            name: spec.name.clone(),
            html_url: Self::file_url(&path),
            default_branch: spec.default_branch.clone(),
            branches: vec![spec.default_branch.clone()],
        })
    }

    fn ensure_branches(&self, repo: &RepoCoordinates, branches: &[String]) -> Result<()> {
        let path = self.repo_path(&repo.name);
        if !path.is_dir() {
            return Err(KeelError::Github(format!(
                "ensure_branches: local repo {} not created",
                path.display()
            )));
        }
        for b in branches {
            if b == &repo.default_branch {
                continue;
            }
            // `git branch <b>` from the default-branch tip; tolerate "already exists".
            let out = cmd::capture("git", ["branch", b], &path)?;
            if !out.status.success() {
                let msg = cmd::describe(&out);
                if msg.contains("already exists") {
                    continue;
                }
                return Err(KeelError::Github(format!(
                    "creating local branch {b} in {}: {msg}",
                    path.display()
                )));
            }
        }
        Ok(())
    }

    fn write_protection(&self, _repo: &RepoCoordinates, _policy: &ProtectionPolicy) -> Result<()> {
        // Local disk has no branch-protection concept; the durable record is the committed
        // `branch-protection.json`. No-op (best-effort, like the gh provider).
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use keel_core::RenderedFile;
    use tempfile::TempDir;

    fn spec() -> RepoSpec {
        RepoSpec {
            owner: "Alex793x".into(),
            name: "keel-local-demo".into(),
            description: "local demo".into(),
            private: true,
            default_branch: "main".into(),
            files: vec![
                RenderedFile::text("README.md", "# demo\n"),
                RenderedFile::text("nested/dir/file.txt", "deep\n"),
                // A file containing GitHub Actions `${{ }}` syntax — must be byte-preserved.
                RenderedFile::text(
                    ".github/workflows/ci.yml",
                    "on: push\njobs:\n  b:\n    runs-on: ${{ matrix.os }}\n",
                ),
            ],
            commit_message: "chore: scaffold keel repo".into(),
        }
    }

    #[test]
    fn create_writes_files_byte_correct() {
        let td = TempDir::new().unwrap();
        let p = LocalDirProvider::new(td.path().to_path_buf());
        let coords = p.create_repo(&spec()).unwrap();

        let repo = td.path().join("keel-local-demo");
        assert_eq!(
            std::fs::read_to_string(repo.join("README.md")).unwrap(),
            "# demo\n"
        );
        assert_eq!(
            std::fs::read_to_string(repo.join("nested/dir/file.txt")).unwrap(),
            "deep\n"
        );
        // `${{ }}` is preserved verbatim.
        let ci = std::fs::read_to_string(repo.join(".github/workflows/ci.yml")).unwrap();
        assert!(ci.contains("${{ matrix.os }}"), "ci.yml = {ci:?}");

        assert!(coords.html_url.starts_with("file://"));
        assert!(coords.html_url.ends_with("keel-local-demo"));
        assert_eq!(coords.default_branch, "main");
    }

    #[test]
    fn create_makes_exactly_one_commit() {
        let td = TempDir::new().unwrap();
        let p = LocalDirProvider::new(td.path().to_path_buf());
        p.create_repo(&spec()).unwrap();
        let repo = td.path().join("keel-local-demo");

        let log = cmd::run("git", ["log", "--oneline"], &repo).unwrap();
        let lines: Vec<&str> = log.lines().filter(|l| !l.trim().is_empty()).collect();
        assert_eq!(lines.len(), 1, "expected exactly one commit, got: {log:?}");
        assert!(lines[0].contains("chore: scaffold keel repo"));
    }

    #[test]
    fn ensure_branches_creates_main_dev_staging() {
        let td = TempDir::new().unwrap();
        let p = LocalDirProvider::new(td.path().to_path_buf());
        let coords = p.create_repo(&spec()).unwrap();
        p.ensure_branches(&coords, &["main".into(), "dev".into(), "staging".into()])
            .unwrap();

        let repo = td.path().join("keel-local-demo");
        let branches = cmd::run("git", ["branch", "--format=%(refname:short)"], &repo).unwrap();
        let set: Vec<&str> = branches.lines().map(str::trim).collect();
        assert!(set.contains(&"main"), "branches = {set:?}");
        assert!(set.contains(&"dev"), "branches = {set:?}");
        assert!(set.contains(&"staging"), "branches = {set:?}");
    }

    #[test]
    fn create_is_idempotent() {
        let td = TempDir::new().unwrap();
        let p = LocalDirProvider::new(td.path().to_path_buf());
        let a = p.create_repo(&spec()).unwrap();
        assert!(p.repo_exists("Alex793x", "keel-local-demo").unwrap());
        let b = p.create_repo(&spec()).unwrap();
        assert_eq!(a, b);

        // Still exactly one commit after the second create.
        let repo = td.path().join("keel-local-demo");
        let log = cmd::run("git", ["log", "--oneline"], &repo).unwrap();
        assert_eq!(log.lines().filter(|l| !l.trim().is_empty()).count(), 1);
    }

    #[test]
    fn ensure_branches_is_tolerant_of_existing() {
        let td = TempDir::new().unwrap();
        let p = LocalDirProvider::new(td.path().to_path_buf());
        let coords = p.create_repo(&spec()).unwrap();
        p.ensure_branches(&coords, &["dev".into()]).unwrap();
        // Second call must not error even though `dev` already exists.
        p.ensure_branches(&coords, &["dev".into(), "staging".into()])
            .unwrap();
    }
}
