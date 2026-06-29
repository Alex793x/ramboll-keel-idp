//! # keel-core
//!
//! The contract crate for Keel — the project-initialization layer of the Ramboll Developer
//! Platform. It defines the domain types, the [`RepoProvider`] I/O abstraction, and the error
//! type shared by every other crate. Keeping I/O behind a trait lets [`crate::RepoProvider`]
//! implementations (real `gh` CLI, or an in-memory fake) be swapped, so the engine is fully
//! unit-testable without touching GitHub.
//!
//! These signatures are **frozen**: downstream crates compile against them.

#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

/// A Ramboll department (mocked in the MVP). Maps to a GitHub team slug used for CODEOWNERS.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Department {
    pub id: String,
    pub name: String,
    /// e.g. `"buildings"` → CODEOWNERS `@<org>/buildings`.
    pub team_slug: String,
}

/// A user who will own / review the new project (mocked in the MVP).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    /// GitHub handle without the leading `@`.
    pub github_login: String,
}

/// The kind of Python service a blueprint can produce.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ServiceKind {
    RestApi,
    Worker,
}

impl ServiceKind {
    /// The manifest/template token, e.g. `"rest-api"`.
    #[must_use]
    pub fn as_token(self) -> &'static str {
        match self {
            ServiceKind::RestApi => "rest-api",
            ServiceKind::Worker => "worker",
        }
    }
}

impl std::str::FromStr for ServiceKind {
    type Err = KeelError;
    fn from_str(s: &str) -> Result<Self> {
        match s {
            "rest-api" | "rest_api" | "restapi" => Ok(ServiceKind::RestApi),
            "worker" => Ok(ServiceKind::Worker),
            other => Err(KeelError::Validation(format!(
                "unknown service_kind: {other:?}"
            ))),
        }
    }
}

/// The validated form a developer submits — the single input to initialization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InitRequest {
    pub project_name: String,
    pub blueprint: String,
    pub department: Department,
    /// Selected owners → CODEOWNERS reviewers. Must be non-empty.
    pub users: Vec<User>,
    pub service_kind: ServiceKind,
    pub description: String,
    pub author: String,
}

/// Validation regex for project names (also enforced by the blueprint manifest).
pub const PROJECT_NAME_PATTERN: &str = r"^[a-z][a-z0-9-]{2,40}$";

impl InitRequest {
    /// Structural validation that does not require the manifest (cheap pre-check).
    ///
    /// # Errors
    /// Returns [`KeelError::Validation`] if the project name is malformed or no users are selected.
    pub fn validate_basic(&self) -> Result<()> {
        if !is_valid_project_name(&self.project_name) {
            return Err(KeelError::Validation(format!(
                "project_name {:?} must match {PROJECT_NAME_PATTERN}",
                self.project_name
            )));
        }
        if self.users.is_empty() {
            return Err(KeelError::Validation(
                "at least one owning user must be selected".to_owned(),
            ));
        }
        Ok(())
    }
}

/// Pure check of the project-name rule (no regex dependency, so `keel-core` stays light).
#[must_use]
pub fn is_valid_project_name(name: &str) -> bool {
    let len = name.chars().count();
    if !(3..=41).contains(&len) {
        return false;
    }
    let mut chars = name.chars();
    let first = chars.next().expect("len checked");
    if !first.is_ascii_lowercase() {
        return false;
    }
    chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering & workflow
// ─────────────────────────────────────────────────────────────────────────────

/// One rendered file destined for the new repository. Bytes, so templates stay binary-safe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RenderedFile {
    pub path: String,
    #[serde(with = "serde_bytes_b64")]
    pub contents: Vec<u8>,
}

impl RenderedFile {
    #[must_use]
    pub fn text(path: impl Into<String>, contents: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            contents: contents.into().into_bytes(),
        }
    }
}

/// Status of a single workflow step. Serializes lowercase (`"done"`, `"skipped"`, …).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Started,
    Done,
    Skipped,
    Error,
}

/// A progress event emitted once per workflow step (the Hub renders these live).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub step: u8,
    pub key: String,
    pub title: String,
    pub status: Status,
    #[serde(default)]
    pub detail: String,
}

impl ProgressEvent {
    #[must_use]
    pub fn new(
        step: u8,
        key: &str,
        title: &str,
        status: Status,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            step,
            key: key.to_owned(),
            title: title.to_owned(),
            status,
            detail: detail.into(),
        }
    }
}

/// The canonical, ordered keys of the 8-step initialization workflow (whitepaper §6).
pub const WORKFLOW_STEPS: [&str; 8] = [
    "signin",
    "form",
    "render",
    "create_repo",
    "commit",
    "branches",
    "seed_ci",
    "register",
];

/// Where a created repository lives.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepoCoordinates {
    pub owner: String,
    pub name: String,
    pub html_url: String,
    pub default_branch: String,
    pub branches: Vec<String>,
}

/// The result handed back when initialization completes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InitOutcome {
    pub project: String,
    pub repo: RepoCoordinates,
    pub docs_path: String,
    pub blueprint_version: String,
    pub catalog_id: String,
    pub events: Vec<ProgressEvent>,
}

// ─────────────────────────────────────────────────────────────────────────────
// I/O abstraction (dependency inversion)
// ─────────────────────────────────────────────────────────────────────────────

/// What the engine needs from a Git host. Implemented by `GhCliProvider` (real) and
/// `FakeProvider` (tests). The engine never talks to GitHub directly.
pub trait RepoProvider {
    /// Does `<owner>/<name>` already exist? (drives idempotency)
    fn repo_exists(&self, owner: &str, name: &str) -> Result<bool>;

    /// Create the repository and push the initial commit on its default branch.
    fn create_repo(&self, spec: &RepoSpec) -> Result<RepoCoordinates>;

    /// Ensure the given branches exist (creating them from the default branch as needed).
    fn ensure_branches(&self, repo: &RepoCoordinates, branches: &[String]) -> Result<()>;

    /// Apply (best-effort) branch protection. Implementations may legitimately no-op/skip.
    fn write_protection(&self, repo: &RepoCoordinates, policy: &ProtectionPolicy) -> Result<()>;
}

/// Everything needed to create a repository and seed its first commit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepoSpec {
    pub owner: String,
    pub name: String,
    pub description: String,
    pub private: bool,
    pub default_branch: String,
    pub files: Vec<RenderedFile>,
    pub commit_message: String,
}

/// Branch-protection intent (recorded even when the host cannot enforce it).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProtectionPolicy {
    pub branch: String,
    pub required_reviews: u8,
    pub require_codeowners: bool,
    pub required_checks: Vec<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/// The single error type threaded through Keel.
#[derive(Debug, thiserror::Error)]
pub enum KeelError {
    #[error("validation error: {0}")]
    Validation(String),
    #[error("render error: {0}")]
    Render(String),
    #[error("github error: {0}")]
    Github(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("conflict: {0}")]
    Conflict(String),
}

impl From<std::io::Error> for KeelError {
    fn from(e: std::io::Error) -> Self {
        KeelError::Io(e.to_string())
    }
}

/// Convenience alias used across the workspace.
pub type Result<T> = std::result::Result<T, KeelError>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Base64 (de)serialization for [`RenderedFile::contents`] so the API stays JSON-friendly.
mod serde_bytes_b64 {
    use serde::{Deserialize, Deserializer, Serializer};

    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    pub fn serialize<S: Serializer>(bytes: &[u8], s: S) -> std::result::Result<S::Ok, S::Error> {
        let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
        for chunk in bytes.chunks(3) {
            let b = [
                chunk[0],
                *chunk.get(1).unwrap_or(&0),
                *chunk.get(2).unwrap_or(&0),
            ];
            let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
            out.push(TABLE[((n >> 18) & 63) as usize] as char);
            out.push(TABLE[((n >> 12) & 63) as usize] as char);
            out.push(if chunk.len() > 1 {
                TABLE[((n >> 6) & 63) as usize] as char
            } else {
                '='
            });
            out.push(if chunk.len() > 2 {
                TABLE[(n & 63) as usize] as char
            } else {
                '='
            });
        }
        s.serialize_str(&out)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> std::result::Result<Vec<u8>, D::Error> {
        let s = String::deserialize(d)?;
        let mut lut = [255u8; 256];
        for (i, &c) in TABLE.iter().enumerate() {
            lut[c as usize] = i as u8;
        }
        let mut out = Vec::with_capacity(s.len() / 4 * 3);
        let mut buf = 0u32;
        let mut bits = 0u32;
        for c in s.bytes() {
            if c == b'=' {
                break;
            }
            let v = lut[c as usize];
            if v == 255 {
                return Err(serde::de::Error::custom("invalid base64"));
            }
            buf = (buf << 6) | u32::from(v);
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                out.push((buf >> bits) as u8);
            }
        }
        Ok(out)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests (TDD baseline for the contract crate)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_name_rules() {
        assert!(is_valid_project_name("invoicing-api"));
        assert!(is_valid_project_name("abc"));
        assert!(!is_valid_project_name("ab")); // too short
        assert!(!is_valid_project_name("1abc")); // must start with a letter
        assert!(!is_valid_project_name("Abc")); // no uppercase
        assert!(!is_valid_project_name("a_b")); // underscore not allowed
    }

    #[test]
    fn service_kind_roundtrips() {
        assert_eq!(
            "rest-api".parse::<ServiceKind>().unwrap(),
            ServiceKind::RestApi
        );
        assert_eq!(ServiceKind::Worker.as_token(), "worker");
        assert!("nope".parse::<ServiceKind>().is_err());
    }

    #[test]
    fn status_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&Status::Done).unwrap(), "\"done\"");
    }

    #[test]
    fn rendered_file_b64_roundtrips() {
        let f = RenderedFile {
            path: "x".into(),
            contents: b"hello \x00\xff world".to_vec(),
        };
        let json = serde_json::to_string(&f).unwrap();
        let back: RenderedFile = serde_json::from_str(&json).unwrap();
        assert_eq!(f, back);
    }

    proptest::proptest! {
        #[test]
        fn b64_roundtrip_any_bytes(bytes: Vec<u8>) {
            let f = RenderedFile { path: "p".into(), contents: bytes.clone() };
            let json = serde_json::to_string(&f).unwrap();
            let back: RenderedFile = serde_json::from_str(&json).unwrap();
            proptest::prop_assert_eq!(back.contents, bytes);
        }

        #[test]
        fn valid_names_are_lowercase_alnum_dash(name in "[a-z][a-z0-9-]{2,40}") {
            proptest::prop_assert!(is_valid_project_name(&name));
        }
    }
}
