//! [`OctocrabProvider`] — the typed GitHub SDK implementation of [`keel_core::RepoProvider`].
//!
//! This is the production-leaning provider the whitepaper names (Appendix A). It authenticates with
//! a user/personal access token (for the MVP, pulled from `gh auth token` via [`OctocrabProvider::from_gh`])
//! and uses octocrab's typed client plus its documented lower-level `get`/`post`/`put` helpers for
//! the endpoints the typed surface does not cover — repo creation, the Git Data API (one clean
//! initial commit), branch creation, and branch protection.
//!
//! octocrab is async while [`RepoProvider`] is synchronous, so the provider owns a small multi-thread
//! Tokio runtime (one worker) and bridges every call with `block_on`. That is safe from the sync CLI
//! and from the API's `spawn_blocking` worker — neither runs inside an async context.

use std::process::Command;

use base64::Engine as _;
use octocrab::Octocrab;
use serde_json::{json, Value};

use keel_core::{KeelError, ProtectionPolicy, RepoCoordinates, RepoProvider, RepoSpec, Result};

/// A [`RepoProvider`] backed by the typed `octocrab` GitHub SDK.
pub struct OctocrabProvider {
    rt: tokio::runtime::Runtime,
    client: Octocrab,
    /// Authenticated account login — chooses `/user/repos` vs `/orgs/{org}/repos`.
    login: String,
}

impl OctocrabProvider {
    /// Build a provider authenticated with an explicit token.
    ///
    /// # Errors
    /// Returns [`KeelError`] if the runtime or client cannot be built, or the token is invalid.
    pub fn new(token: String) -> Result<Self> {
        // A persistent worker thread keeps octocrab's tower `Buffer` driveable between calls, and the
        // reactor stays alive for the client's lifetime.
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .map_err(|e| KeelError::Io(format!("building tokio runtime: {e}")))?;
        // Build the client INSIDE the runtime so hyper captures the reactor handle.
        let (client, login) = rt.block_on(async {
            let client = Octocrab::builder()
                .user_access_token(token)
                .build()
                .map_err(|e| KeelError::Github(format!("octocrab build: {e}")))?;
            let login = client
                .current()
                .user()
                .await
                .map_err(|e| KeelError::Github(format!("resolve current user: {e}")))?
                .login;
            Ok::<_, KeelError>((client, login))
        })?;
        Ok(Self { rt, client, login })
    }

    /// Build a provider using the token from the local `gh` login (`gh auth token`).
    ///
    /// # Errors
    /// Returns [`KeelError`] if `gh` is missing/unauthenticated or returns an empty token.
    pub fn from_gh() -> Result<Self> {
        let out = Command::new("gh")
            .args(["auth", "token"])
            .output()
            .map_err(|e| KeelError::Io(format!("spawn `gh auth token`: {e}")))?;
        if !out.status.success() {
            return Err(KeelError::Github(format!(
                "`gh auth token` failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            )));
        }
        let token = String::from_utf8_lossy(&out.stdout).trim().to_owned();
        if token.is_empty() {
            return Err(KeelError::Github(
                "`gh auth token` returned an empty token".to_owned(),
            ));
        }
        Self::new(token)
    }

    // ── thin async→sync wrappers around octocrab's generic helpers ──────────────
    fn get(&self, route: &str) -> std::result::Result<Value, octocrab::Error> {
        self.rt
            .block_on(async { self.client.get::<Value, _, ()>(route, None::<&()>).await })
    }

    fn post_raw(&self, route: &str, body: &Value) -> std::result::Result<Value, octocrab::Error> {
        self.rt
            .block_on(async { self.client.post::<Value, Value>(route, Some(body)).await })
    }

    fn post(&self, route: &str, body: &Value) -> Result<Value> {
        self.post_raw(route, body)
            .map_err(|e| KeelError::Github(format!("POST {route}: {}", describe_err(&e))))
    }

    fn patch(&self, route: &str, body: &Value) -> Result<Value> {
        self.rt
            .block_on(async {
                self.client
                    .patch::<Value, _, Value>(route, Some(body))
                    .await
            })
            .map_err(|e| KeelError::Github(format!("PATCH {route}: {}", describe_err(&e))))
    }

    fn coordinates(&self, owner: &str, name: &str) -> Result<RepoCoordinates> {
        let v = self.get(&format!("/repos/{owner}/{name}")).map_err(|e| {
            KeelError::Github(format!("GET repo {owner}/{name}: {}", describe_err(&e)))
        })?;
        let default_branch = v["default_branch"].as_str().unwrap_or("main").to_owned();
        Ok(RepoCoordinates {
            owner: owner.to_owned(),
            name: name.to_owned(),
            html_url: v["html_url"].as_str().unwrap_or_default().to_owned(),
            branches: vec![default_branch.clone()],
            default_branch,
        })
    }
}

impl RepoProvider for OctocrabProvider {
    fn repo_exists(&self, owner: &str, name: &str) -> Result<bool> {
        match self.get(&format!("/repos/{owner}/{name}")) {
            Ok(_) => Ok(true),
            // Only a genuine 404 means absent; surface auth/network/rate-limit failures.
            Err(e) if is_not_found(&e) => Ok(false),
            Err(e) => Err(KeelError::Github(format!(
                "GET repo {owner}/{name} failed (not a not-found error): {}",
                describe_err(&e)
            ))),
        }
    }

    fn create_repo(&self, spec: &RepoSpec) -> Result<RepoCoordinates> {
        // Idempotent: if it already exists, return its coordinates without re-creating/committing.
        if self.repo_exists(&spec.owner, &spec.name)? {
            return self.coordinates(&spec.owner, &spec.name);
        }

        // 1. Create the repo (under the user account or an org). We auto-init so the repo is not
        //    empty — the Git Data API rejects blob/tree/commit writes on a wholly empty repo
        //    ("Git Repository is empty", 409).
        let create_route = if spec.owner == self.login {
            "/user/repos".to_owned()
        } else {
            format!("/orgs/{}/repos", spec.owner)
        };
        let created = self.post(&create_route, &repo_create_body(spec))?;
        let html_url = created["html_url"].as_str().unwrap_or_default().to_owned();

        // 2. Git Data API: blobs → tree → root commit → force-update the default ref. The commit has
        //    NO parents, so it replaces the auto-init commit (which becomes unreachable). The result
        //    is exactly one clean commit containing the rendered tree.
        let (owner, name) = (&spec.owner, &spec.name);
        let mut entries = Vec::with_capacity(spec.files.len());
        for f in &spec.files {
            let blob = self.post(
                &format!("/repos/{owner}/{name}/git/blobs"),
                &blob_body(&f.contents),
            )?;
            let sha = blob["sha"]
                .as_str()
                .ok_or_else(|| KeelError::Github(format!("blob for {}: no sha", f.path)))?;
            entries.push(tree_entry(&f.path, sha));
        }
        let tree = self.post(
            &format!("/repos/{owner}/{name}/git/trees"),
            &json!({ "tree": entries }),
        )?;
        let tree_sha = tree["sha"]
            .as_str()
            .ok_or_else(|| KeelError::Github("git tree: no sha".to_owned()))?;
        let commit = self.post(
            &format!("/repos/{owner}/{name}/git/commits"),
            &json!({ "message": spec.commit_message, "tree": tree_sha, "parents": [] }),
        )?;
        let commit_sha = commit["sha"]
            .as_str()
            .ok_or_else(|| KeelError::Github("git commit: no sha".to_owned()))?;
        // Force the default branch to our root commit; the auto-init commit is discarded.
        self.patch(
            &format!(
                "/repos/{owner}/{name}/git/refs/heads/{}",
                spec.default_branch
            ),
            &json!({ "sha": commit_sha, "force": true }),
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
        let (owner, name) = (&repo.owner, &repo.name);
        let default = &repo.default_branch;
        let refv = self
            .get(&format!("/repos/{owner}/{name}/git/ref/heads/{default}"))
            .map_err(|e| KeelError::Github(format!("read default ref: {}", describe_err(&e))))?;
        let sha = refv["object"]["sha"]
            .as_str()
            .ok_or_else(|| KeelError::Github("default ref: no sha".to_owned()))?
            .to_owned();
        for b in branches {
            if b == default {
                continue;
            }
            if let Err(e) = self.post_raw(
                &format!("/repos/{owner}/{name}/git/refs"),
                &json!({ "ref": format!("refs/heads/{b}"), "sha": sha }),
            ) {
                if describe_err(&e).to_lowercase().contains("already exists") {
                    continue; // idempotent
                }
                return Err(KeelError::Github(format!(
                    "create branch {b}: {}",
                    describe_err(&e)
                )));
            }
        }
        Ok(())
    }

    fn write_protection(&self, repo: &RepoCoordinates, policy: &ProtectionPolicy) -> Result<()> {
        // Best-effort: protection PUT commonly 403s on personal repos. The durable record is the
        // `branch-protection.json` the engine commits; never fail the workflow here.
        let route = format!(
            "/repos/{}/{}/branches/{}/protection",
            repo.owner, repo.name, policy.branch
        );
        let body = protection_body(policy);
        let res = self.rt.block_on(async {
            self.client
                .put::<Value, _, Value>(&route, Some(&body))
                .await
        });
        if let Err(e) = res {
            eprintln!(
                "keel: branch protection not applied for {}/{} ({}) — best-effort: {e}",
                repo.owner, repo.name, policy.branch
            );
        }
        Ok(())
    }
}

// ── Error helpers ──────────────────────────────────────────────────────────────

/// Concise, log-friendly text for an octocrab error. `Display` is unhelpfully just "GitHub" and full
/// `Debug` includes a backtrace, so we take the head of the Debug form — which carries the GitHub API
/// message and status code.
fn describe_err(e: &octocrab::Error) -> String {
    format!("{e:?}").chars().take(300).collect()
}

/// Whether an octocrab error is a genuine HTTP 404 (resource absent), not auth/network/rate-limit.
fn is_not_found(e: &octocrab::Error) -> bool {
    let s = describe_err(e).to_lowercase();
    s.contains("404") || s.contains("not found")
}

// ── Pure request-body builders (unit-tested without network) ───────────────────

/// Body for `POST /user/repos` (or `/orgs/{org}/repos`). `auto_init: true` so the repo is not empty
/// (the Git Data API rejects writes on a wholly empty repo); the engine then replaces the auto-init
/// commit with a single root commit carrying the rendered tree.
fn repo_create_body(spec: &RepoSpec) -> Value {
    json!({
        "name": spec.name,
        "private": spec.private,
        "description": spec.description,
        "auto_init": true,
    })
}

/// Body for `POST .../git/blobs` — base64 so any bytes survive.
fn blob_body(bytes: &[u8]) -> Value {
    json!({
        "content": base64::engine::general_purpose::STANDARD.encode(bytes),
        "encoding": "base64",
    })
}

/// One `tree` entry for `POST .../git/trees` (regular file blob).
fn tree_entry(path: &str, sha: &str) -> Value {
    json!({ "path": path, "mode": "100644", "type": "blob", "sha": sha })
}

/// Body for `PUT .../branches/{b}/protection`, mapped from a [`ProtectionPolicy`].
fn protection_body(policy: &ProtectionPolicy) -> Value {
    json!({
        "required_status_checks": { "strict": true, "contexts": policy.required_checks },
        "enforce_admins": true,
        "required_pull_request_reviews": {
            "required_approving_review_count": policy.required_reviews,
            "require_code_owner_reviews": policy.require_codeowners,
        },
        "restrictions": null,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> RepoSpec {
        RepoSpec {
            owner: "Alex793x".into(),
            name: "demo-svc".into(),
            description: "a demo".into(),
            private: true,
            default_branch: "main".into(),
            files: vec![],
            commit_message: "chore: scaffold".into(),
        }
    }

    #[test]
    fn repo_create_body_is_private_auto_init() {
        let b = repo_create_body(&spec());
        assert_eq!(b["name"], "demo-svc");
        assert_eq!(b["private"], true);
        assert_eq!(b["auto_init"], true);
        assert_eq!(b["description"], "a demo");
    }

    #[test]
    fn blob_body_base64_encodes() {
        let b = blob_body(b"hi");
        assert_eq!(b["encoding"], "base64");
        assert_eq!(b["content"], "aGk="); // base64("hi")
    }

    #[test]
    fn tree_entry_is_a_regular_file_blob() {
        let e = tree_entry("src/app.py", "deadbeef");
        assert_eq!(e["path"], "src/app.py");
        assert_eq!(e["mode"], "100644");
        assert_eq!(e["type"], "blob");
        assert_eq!(e["sha"], "deadbeef");
    }

    #[test]
    fn protection_body_maps_policy_fields() {
        let policy = ProtectionPolicy {
            branch: "main".into(),
            required_reviews: 2,
            require_codeowners: true,
            required_checks: vec!["build".into(), "test".into()],
        };
        let b = protection_body(&policy);
        assert_eq!(
            b["required_pull_request_reviews"]["required_approving_review_count"],
            2
        );
        assert_eq!(
            b["required_pull_request_reviews"]["require_code_owner_reviews"],
            true
        );
        assert_eq!(b["required_status_checks"]["contexts"][0], "build");
        assert_eq!(b["required_status_checks"]["contexts"][1], "test");
    }
}
