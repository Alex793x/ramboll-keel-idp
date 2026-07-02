//! [`GhCliProvider`] — the real [`RepoProvider`], implemented over the user's authenticated `gh`
//! CLI plus `git`, via `std::process::Command`. No network library, no async.

use keel_core::{
    KeelError, ProtectionPolicy, RenderedFile, RepoCoordinates, RepoProvider, RepoSpec, Result,
};

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

/// Build the `gh api` endpoint for the contents API: `repos/{owner}/{name}/contents/{path}?ref={branch}`.
///
/// Extracted as a pure function so the exact endpoint is unit-testable without invoking `gh`.
/// Paths are Keel-rendered slugs (`[a-z0-9-_./]`), so no percent-encoding is required.
#[must_use]
pub fn build_contents_endpoint(owner: &str, name: &str, path: &str, branch: &str) -> String {
    format!("repos/{owner}/{name}/contents/{path}?ref={branch}")
}

/// Build the exact argv for the shallow single-branch clone used by `push_files`
/// (`gh repo clone {owner}/{name} {dir} -- --depth 1 --branch {branch}`). Pure, for unit tests.
#[must_use]
pub fn build_push_clone_argv(owner: &str, name: &str, dir: &str, branch: &str) -> Vec<String> {
    vec![
        "repo".to_owned(),
        "clone".to_owned(),
        format!("{owner}/{name}"),
        dir.to_owned(),
        "--".to_owned(),
        "--depth".to_owned(),
        "1".to_owned(),
        "--branch".to_owned(),
        branch.to_owned(),
    ]
}

/// Decode the base64 payload of the GitHub contents API, tolerating the embedded newlines the
/// API inserts every 60 characters. `None` on any non-base64 byte.
#[must_use]
pub(crate) fn decode_base64_content(s: &str) -> Option<Vec<u8>> {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lut = [255u8; 256];
    for (i, &c) in TABLE.iter().enumerate() {
        lut[c as usize] = u8::try_from(i).unwrap_or(255);
    }
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for c in s.bytes() {
        if c.is_ascii_whitespace() {
            continue;
        }
        if c == b'=' {
            break;
        }
        let v = lut[c as usize];
        if v == 255 {
            return None;
        }
        buf = (buf << 6) | u32::from(v);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

/// True when a failed `gh` invocation's output reads as a plain "not found" (vs auth/network/
/// rate-limit failures, which must surface as errors). Same classification idiom as
/// [`GhCliProvider::repo_exists`].
fn is_not_found(msg: &str) -> bool {
    let msg = msg.to_lowercase();
    msg.contains("could not resolve to a repository")
        || msg.contains("not found")
        || msg.contains("404")
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
        let out = cmd::capture("gh", ["repo", "view", &slug], &cwd)?;
        if out.status.success() {
            return Ok(true);
        }
        // Only a genuine "not found" means the repo is absent. Auth/network/rate-limit failures
        // must NOT be silently classified as "absent" (that would make the workflow try to create an
        // existing repo); surface them so the caller aborts with an actionable error.
        if is_not_found(&cmd::describe(&out)) {
            Ok(false)
        } else {
            Err(KeelError::Github(format!(
                "`gh repo view {slug}` failed (not a not-found error): {}",
                cmd::describe(&out)
            )))
        }
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
            default_branch: spec.default_branch.clone(),
            branches: vec![spec.default_branch.clone()],
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
        // `branch-protection.json`, committed inside the repo by the engine (see keel-engine
        // workflow::branch_protection_file), so we never fail the workflow here — on any error we log
        // to stderr and return Ok(()).
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

    fn read_file(
        &self,
        repo: &RepoCoordinates,
        branch: &str,
        path: &str,
    ) -> Result<Option<Vec<u8>>> {
        let cwd = std::env::current_dir().map_err(|e| KeelError::Io(e.to_string()))?;
        let endpoint = build_contents_endpoint(&repo.owner, &repo.name, path, branch);
        let out = cmd::capture("gh", ["api", &endpoint, "--jq", ".content"], &cwd)?;
        if !out.status.success() {
            let msg = cmd::describe(&out);
            // Same not-found classification as repo_exists: only a genuine 404 is Ok(None).
            return if is_not_found(&msg) {
                Ok(None)
            } else {
                Err(KeelError::Github(format!(
                    "`gh api {endpoint}` failed (not a not-found error): {msg}"
                )))
            };
        }
        let b64 = String::from_utf8_lossy(&out.stdout);
        decode_base64_content(b64.trim()).map(Some).ok_or_else(|| {
            KeelError::Github(format!(
                "contents API returned invalid base64 for {}/{}:{path}@{branch}",
                repo.owner, repo.name
            ))
        })
    }

    fn push_files(
        &self,
        repo: &RepoCoordinates,
        branch: &str,
        files: &[RenderedFile],
        message: &str,
    ) -> Result<()> {
        // Shallow single-branch clone into a temp dir, write, one commit, push.
        let staging = tempfile::TempDir::new().map_err(|e| KeelError::Io(e.to_string()))?;
        let root = staging.path();
        let argv = build_push_clone_argv(&repo.owner, &repo.name, "repo", branch);
        cmd::run("gh", &argv, root)?;
        let work = root.join("repo");
        cmd::write_files(&work, files)?;
        cmd::git_commit_all(&work, message)?;
        cmd::run("git", ["push", "origin", branch], &work)?;
        Ok(())
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

    // ── v5 pure parts: contents endpoint, clone argv, base64, not-found ─────

    #[test]
    fn contents_endpoint_is_exact() {
        assert_eq!(
            build_contents_endpoint("Alex793x", "demo", "keel.services.json", "dev"),
            "repos/Alex793x/demo/contents/keel.services.json?ref=dev"
        );
        assert_eq!(
            build_contents_endpoint("o", "r", "services/ingest/README.md", "main"),
            "repos/o/r/contents/services/ingest/README.md?ref=main"
        );
    }

    #[test]
    fn push_clone_argv_is_exact() {
        assert_eq!(
            build_push_clone_argv("Alex793x", "demo", "repo", "dev"),
            vec![
                "repo",
                "clone",
                "Alex793x/demo",
                "repo",
                "--",
                "--depth",
                "1",
                "--branch",
                "dev",
            ]
        );
    }

    #[test]
    fn base64_content_decodes_with_api_newlines() {
        // "hello keel" → aGVsbG8ga2VlbA== ; the contents API wraps lines with \n.
        assert_eq!(
            decode_base64_content("aGVsbG8g\na2VlbA==\n").as_deref(),
            Some(b"hello keel".as_slice())
        );
        assert_eq!(decode_base64_content("").as_deref(), Some(b"".as_slice()));
        assert!(decode_base64_content("not*base64!").is_none());
    }

    #[test]
    fn base64_content_round_trips_rendered_bytes() {
        // Encode with the same alphabet, decode with ours (binary-safe check).
        const TABLE: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let bytes: Vec<u8> = (0u8..=255).collect();
        let mut enc = String::new();
        for chunk in bytes.chunks(3) {
            let b = [
                chunk[0],
                *chunk.get(1).unwrap_or(&0),
                *chunk.get(2).unwrap_or(&0),
            ];
            let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
            enc.push(TABLE[((n >> 18) & 63) as usize] as char);
            enc.push(TABLE[((n >> 12) & 63) as usize] as char);
            enc.push(if chunk.len() > 1 {
                TABLE[((n >> 6) & 63) as usize] as char
            } else {
                '='
            });
            enc.push(if chunk.len() > 2 {
                TABLE[(n & 63) as usize] as char
            } else {
                '='
            });
        }
        assert_eq!(
            decode_base64_content(&enc).as_deref(),
            Some(bytes.as_slice())
        );
    }

    #[test]
    fn not_found_classification_matches_repo_exists_idiom() {
        assert!(is_not_found(
            "HTTP 404: Not Found (https://api.github.com/...)"
        ));
        assert!(is_not_found("GraphQL: Could not resolve to a Repository"));
        assert!(!is_not_found("HTTP 401: Bad credentials"));
        assert!(!is_not_found("error connecting to api.github.com"));
    }
}
