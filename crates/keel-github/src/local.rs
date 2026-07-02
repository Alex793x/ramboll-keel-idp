//! [`LocalDirProvider`] — a hermetic [`RepoProvider`] that writes the repository to local disk and
//! creates real local `git` branches, with **no `gh` and no network**.
//!
//! This powers green-from-birth testing: the CLI `--local` mode and CI use it to produce a real,
//! commit-backed repo on disk that can be cloned/inspected and run through the blueprint's own
//! quality gate, without authenticating to GitHub. `create_repo` returns coordinates whose
//! `html_url` is a `file://` URL pointing at the on-disk repo.

use std::path::PathBuf;

use keel_core::{
    KeelError, ProtectionPolicy, RenderedFile, RepoCoordinates, RepoProvider, RepoSpec, Result,
};

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
        // Local disk has no branch-protection concept; the durable record is the
        // `branch-protection.json` committed by the engine. No-op (best-effort, like the gh provider).
        Ok(())
    }

    fn read_file(
        &self,
        repo: &RepoCoordinates,
        branch: &str,
        path: &str,
    ) -> Result<Option<Vec<u8>>> {
        let repo_path = self.repo_path(&repo.name);
        if !repo_path.is_dir() {
            return Err(KeelError::Github(format!(
                "read_file: local repo {} not created",
                repo_path.display()
            )));
        }
        // `git show {branch}:{path}` reads the blob from the branch's committed tree without
        // touching the working copy (checkout-free, binary-safe raw stdout).
        let spec = format!("{branch}:{path}");
        let out = cmd::capture("git", ["show", &spec], &repo_path)?;
        if out.status.success() {
            return Ok(Some(out.stdout));
        }
        let msg = cmd::describe(&out);
        // A missing PATH on an existing branch is a genuine not-found; a missing BRANCH
        // ("invalid object name") or any other failure is an error.
        if msg.contains("does not exist") || msg.contains("exists on disk, but not in") {
            Ok(None)
        } else {
            Err(KeelError::Github(format!(
                "git show {spec} in {}: {msg}",
                repo_path.display()
            )))
        }
    }

    fn push_files(
        &self,
        repo: &RepoCoordinates,
        branch: &str,
        files: &[RenderedFile],
        message: &str,
    ) -> Result<()> {
        let repo_path = self.repo_path(&repo.name);
        if !repo_path.is_dir() {
            return Err(KeelError::Github(format!(
                "push_files: local repo {} not created",
                repo_path.display()
            )));
        }
        // Switch to the target branch, write + commit, then restore the prior branch — even on
        // failure, so a broken push never leaves the checkout on the wrong branch.
        let prior = cmd::run("git", ["rev-parse", "--abbrev-ref", "HEAD"], &repo_path)?;
        cmd::run("git", ["switch", branch], &repo_path)?;
        let commit_result = cmd::write_files(&repo_path, files)
            .and_then(|()| cmd::git_commit_all(&repo_path, message));
        let restore_result = cmd::run("git", ["switch", &prior], &repo_path);
        commit_result?;
        restore_result?;
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

    // ── v5: read_file / push_files round-trip ───────────────────────────────

    #[test]
    fn push_files_to_dev_round_trips_and_leaves_main_untouched() {
        let td = TempDir::new().unwrap();
        let p = LocalDirProvider::new(td.path().to_path_buf());
        let coords = p.create_repo(&spec()).unwrap();
        p.ensure_branches(&coords, &["main".into(), "dev".into()])
            .unwrap();

        let pushed = vec![
            RenderedFile::text("services/ingest/README.md", "# ingest\n"),
            RenderedFile::text("keel.services.json", "{\"version\":1}\n"),
        ];
        p.push_files(
            &coords,
            "dev",
            &pushed,
            "feat: add service ingest (api:python)",
        )
        .unwrap();

        // read_file sees the pushed bytes on dev…
        let readme = p
            .read_file(&coords, "dev", "services/ingest/README.md")
            .unwrap()
            .expect("pushed file readable on dev");
        assert_eq!(readme, b"# ingest\n");
        // …and the pre-existing file is still there on dev.
        let existing = p.read_file(&coords, "dev", "README.md").unwrap();
        assert_eq!(existing.as_deref(), Some(b"# demo\n".as_slice()));
        // main is untouched (the new path does not exist there).
        assert_eq!(
            p.read_file(&coords, "main", "services/ingest/README.md")
                .unwrap(),
            None
        );

        // Exactly one NEW commit on dev; main still has exactly one.
        let repo = td.path().join("keel-local-demo");
        let count = |branch: &str| -> usize {
            cmd::run("git", ["rev-list", "--count", branch], &repo)
                .unwrap()
                .trim()
                .parse()
                .unwrap()
        };
        assert_eq!(count("dev"), 2, "dev = scaffold + push");
        assert_eq!(count("main"), 1, "main untouched");
        let subject = cmd::run("git", ["log", "-1", "--format=%s", "dev"], &repo).unwrap();
        assert_eq!(subject, "feat: add service ingest (api:python)");

        // The checkout is restored to the branch it was on before the push (main).
        let head = cmd::run("git", ["rev-parse", "--abbrev-ref", "HEAD"], &repo).unwrap();
        assert_eq!(head, "main");
    }

    #[test]
    fn read_file_missing_path_is_none_missing_branch_is_error() {
        let td = TempDir::new().unwrap();
        let p = LocalDirProvider::new(td.path().to_path_buf());
        let coords = p.create_repo(&spec()).unwrap();

        assert_eq!(
            p.read_file(&coords, "main", "no/such/file.txt").unwrap(),
            None
        );
        let err = p
            .read_file(&coords, "no-such-branch", "README.md")
            .expect_err("missing branch is an error, not None");
        assert!(matches!(err, KeelError::Github(_)), "got {err:?}");
    }
}
