//! [`GhCliProvider`] — the real [`RepoProvider`], implemented over the user's authenticated `gh`
//! CLI plus `git`, via `std::process::Command`. No network library, no async.

use keel_core::{KeelError, ProtectionPolicy, RepoCoordinates, RepoProvider, RepoSpec, Result};

use crate::cmd;

/// Creates repositories using the user's authenticated `gh` CLI (and `git`).
#[derive(Debug, Clone)]
pub struct GhCliProvider {
    pub owner: String,
}

impl GhCliProvider {
    #[must_use]
    pub fn new(owner: String) -> Self {
        Self { owner }
    }
}

/// Build the exact argv for `gh repo create` from a [`RepoSpec`] and the staging dir.
///
/// Extracted as a pure function so it can be unit-tested without invoking `gh`. The resulting
/// command (run with `cwd = source`) is:
/// `gh repo create <owner>/<name> --private|--public --source . --remote origin --push
///  --description <description>`.
#[must_use]
pub fn build_repo_create_argv(spec: &RepoSpec) -> Vec<String> {
    vec![
        "repo".to_owned(),
        "create".to_owned(),
        format!("{}/{}", spec.owner, spec.name),
        if spec.private {
            "--private"
        } else {
            "--public"
        }
        .to_owned(),
        "--source".to_owned(),
        ".".to_owned(),
        "--remote".to_owned(),
        "origin".to_owned(),
        "--push".to_owned(),
        "--description".to_owned(),
        spec.description.clone(),
    ]
}

impl GhCliProvider {
    /// Fetch coordinates for an existing repo via `gh repo view --json url,defaultBranchRef`.
    fn view_coordinates(&self, owner: &str, name: &str) -> Result<RepoCoordinates> {
        let slug = format!("{owner}/{name}");
        let cwd = std::env::current_dir().map_err(|e| KeelError::Io(e.to_string()))?;
        let json = cmd::run(
            "gh",
            ["repo", "view", &slug, "--json", "url,defaultBranchRef"],
            &cwd,
        )?;
        let v: serde_json::Value = serde_json::from_str(&json)
            .map_err(|e| KeelError::Github(format!("parse `gh repo view` json: {e}")))?;
        let html_url = v
            .get("url")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_owned();
        let default_branch = v
            .get("defaultBranchRef")
            .and_then(|d| d.get("name"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("main")
            .to_owned();
        Ok(RepoCoordinates {
            owner: owner.to_owned(),
            name: name.to_owned(),
            html_url,
            branches: vec![default_branch.clone()],
            default_branch,
        })
    }
}

impl RepoProvider for GhCliProvider {
    fn repo_exists(&self, owner: &str, name: &str) -> Result<bool> {
        let slug = format!("{owner}/{name}");
        let cwd = std::env::current_dir().map_err(|e| KeelError::Io(e.to_string()))?;
        // Existence check: exit 0 ⇒ exists; any non-zero ⇒ does not (don't treat as a hard error).
        let out = cmd::capture("gh", ["repo", "view", &slug], &cwd)?;
        Ok(out.status.success())
    }

    fn create_repo(&self, spec: &RepoSpec) -> Result<RepoCoordinates> {
        // Idempotent: if the repo already exists, return its coordinates unchanged.
        if self.repo_exists(&spec.owner, &spec.name)? {
            return self.view_coordinates(&spec.owner, &spec.name);
        }

        // Stage the rendered files in a temp dir, init+commit, then create+push via gh.
        let staging = tempfile::TempDir::new().map_err(|e| KeelError::Io(e.to_string()))?;
        let root = staging.path();
        cmd::write_files(root, &spec.files)?;
        cmd::git_init_commit(root, &spec.default_branch, &spec.commit_message)?;

        let argv = build_repo_create_argv(spec);
        cmd::run("gh", &argv, root)?;

        // Read the canonical html_url back from gh (running in the staging repo, which now has the
        // origin remote configured).
        let html_url = cmd::run(
            "gh",
            ["repo", "view", "--json", "url", "--jq", ".url"],
            root,
        )?;

        Ok(RepoCoordinates {
            owner: spec.owner.clone(),
            name: spec.name.clone(),
            html_url,
            default_branch: "main".to_owned(),
            branches: vec!["main".to_owned()],
        })
    }

    fn ensure_branches(&self, repo: &RepoCoordinates, branches: &[String]) -> Result<()> {
        let cwd = std::env::current_dir().map_err(|e| KeelError::Io(e.to_string()))?;
        let default = &repo.default_branch;
        // SHA of the default branch tip — every new branch points here.
        let sha = cmd::run(
            "gh",
            [
                "api",
                &format!("repos/{}/{}/git/ref/heads/{default}", repo.owner, repo.name),
                "--jq",
                ".object.sha",
            ],
            &cwd,
        )?;

        for b in branches {
            if b == default {
                continue;
            }
            let out = cmd::capture(
                "gh",
                [
                    "api",
                    "-X",
                    "POST",
                    &format!("repos/{}/{}/git/refs", repo.owner, repo.name),
                    "-f",
                    &format!("ref=refs/heads/{b}"),
                    "-f",
                    &format!("sha={sha}"),
                ],
                &cwd,
            )?;
            if !out.status.success() {
                let msg = cmd::describe(&out);
                // Tolerate "already exists" — branch creation is idempotent.
                if msg.contains("already exists") || msg.contains("Reference already exists") {
                    continue;
                }
                return Err(KeelError::Github(format!(
                    "creating branch {b} on {}/{}: {msg}",
                    repo.owner, repo.name
                )));
            }
        }
        Ok(())
    }

    fn write_protection(&self, repo: &RepoCoordinates, policy: &ProtectionPolicy) -> Result<()> {
        // Best-effort: branch protection commonly fails on personal repos. The durable record is
        // `branch-protection.json` committed inside the repo by the template, so we never fail the
        // workflow here — on any error we log to stderr and return Ok(()).
        let cwd = match std::env::current_dir() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("keel-github: write_protection skipped (cwd: {e})");
                return Ok(());
            }
        };

        let checks_json: Vec<serde_json::Value> = policy
            .required_checks
            .iter()
            .map(|c| serde_json::Value::String(c.clone()))
            .collect();
        let body = serde_json::json!({
            "required_status_checks": {
                "strict": true,
                "contexts": checks_json,
            },
            "enforce_admins": true,
            "required_pull_request_reviews": {
                "required_approving_review_count": policy.required_reviews,
                "require_code_owner_reviews": policy.require_codeowners,
            },
            "restrictions": serde_json::Value::Null,
        });

        let endpoint = format!(
            "repos/{}/{}/branches/{}/protection",
            repo.owner, repo.name, policy.branch
        );

        // Write the request body to a temp file and pass it via `--input <file>` (nested JSON does
        // not map cleanly onto `gh api -f` flags).
        let body_dir = match tempfile::TempDir::new() {
            Ok(d) => d,
            Err(e) => {
                eprintln!("keel-github: write_protection skipped (tempdir: {e})");
                return Ok(());
            }
        };
        let body_path = body_dir.path().join("protection.json");
        if let Err(e) = std::fs::write(&body_path, body.to_string().as_bytes()) {
            eprintln!("keel-github: write_protection skipped (write body: {e})");
            return Ok(());
        }

        match cmd::capture(
            "gh",
            [
                "api",
                "-X",
                "PUT",
                &endpoint,
                "--input",
                &body_path.to_string_lossy(),
            ],
            &cwd,
        ) {
            Ok(out) if out.status.success() => Ok(()),
            Ok(out) => {
                eprintln!(
                    "keel-github: branch protection on {}/{}@{} not applied (best-effort): {}",
                    repo.owner,
                    repo.name,
                    policy.branch,
                    cmd::describe(&out)
                );
                Ok(())
            }
            Err(e) => {
                eprintln!(
                    "keel-github: branch protection on {}/{}@{} skipped (best-effort): {e}",
                    repo.owner, repo.name, policy.branch
                );
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use keel_core::RenderedFile;

    fn spec(private: bool) -> RepoSpec {
        RepoSpec {
            owner: "Alex793x".into(),
            name: "keel-e2e-demo".into(),
            description: "A demo repo".into(),
            private,
            default_branch: "main".into(),
            files: vec![RenderedFile::text("README.md", "# demo")],
            commit_message: "chore: scaffold".into(),
        }
    }

    #[test]
    fn argv_private_repo_is_exact() {
        let argv = build_repo_create_argv(&spec(true));
        assert_eq!(
            argv,
            vec![
                "repo",
                "create",
                "Alex793x/keel-e2e-demo",
                "--private",
                "--source",
                ".",
                "--remote",
                "origin",
                "--push",
                "--description",
                "A demo repo",
            ]
        );
    }

    #[test]
    fn argv_public_flag_flips() {
        let argv = build_repo_create_argv(&spec(false));
        assert!(argv.contains(&"--public".to_owned()));
        assert!(!argv.contains(&"--private".to_owned()));
    }

    #[test]
    fn argv_preserves_description_with_spaces() {
        let mut s = spec(true);
        s.description = "Owner: @Alex793x — buildings".into();
        let argv = build_repo_create_argv(&s);
        // Description is a single argv element (not split on spaces).
        let idx = argv.iter().position(|a| a == "--description").unwrap();
        assert_eq!(argv[idx + 1], "Owner: @Alex793x — buildings");
    }
}
