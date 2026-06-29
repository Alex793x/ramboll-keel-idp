//! # keel-blueprint
//!
//! Loads a blueprint manifest (`blueprint.yaml`, schema `keel/v1`), validates an [`InitRequest`]
//! against it, derives the rendering context, and renders the `template/` tree with MiniJinja.
//!
//! **Renderer rules (frozen contract):**
//! - Path segments interpolate `{{ … }}` **always**.
//! - File **contents** are rendered through MiniJinja **only if the filename ends in `.j2`** (the
//!   suffix is then stripped); every other file is copied **verbatim** so GitHub Actions `${{ … }}`
//!   expressions survive untouched.
//! - `template.conditions` may include/exclude paths based on a `when` expression.
//!
//! > Phase-0 stub: public signatures are frozen; `Fleet-Blueprint-RS` fills the bodies + tests.

#![forbid(unsafe_code)]

use std::path::Path;

use keel_core::{InitRequest, RenderedFile, Result};
use serde::{Deserialize, Serialize};

/// A parsed blueprint manifest (`keel/v1`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Manifest {
    pub api_version: String,
    pub kind: String,
    pub name: String,
    pub title: String,
    pub description: String,
    pub version: String,
    pub owner: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub parameters: Vec<Parameter>,
    #[serde(default)]
    pub repository: RepositorySpec,
}

/// One form parameter (becomes a Hub form field).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Parameter {
    pub id: String,
    pub title: String,
    /// `"string"` | `"enum"`.
    pub kind: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub pattern: Option<String>,
    #[serde(default)]
    pub values: Vec<String>,
    #[serde(default)]
    pub default: Option<String>,
    #[serde(default)]
    pub help: Option<String>,
}

/// Repository defaults + branch model + protection, declared by the manifest.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RepositorySpec {
    pub default_branch: String,
    pub branches: Vec<String>,
    #[serde(default)]
    pub protect: Vec<keel_core::ProtectionPolicy>,
}

/// Load and parse `<blueprint_dir>/blueprint.yaml`.
///
/// # Errors
/// [`keel_core::KeelError::Io`] if unreadable, [`keel_core::KeelError::Validation`] if malformed.
pub fn load_manifest(_blueprint_dir: &Path) -> Result<Manifest> {
    todo!("Fleet-Blueprint-RS: parse blueprint.yaml into Manifest")
}

/// Validate a request against the manifest (required params present, enums/pattern satisfied).
///
/// # Errors
/// [`keel_core::KeelError::Validation`] on any rule violation.
pub fn validate_request(_manifest: &Manifest, _req: &InitRequest) -> Result<()> {
    todo!("Fleet-Blueprint-RS: validate the request against the manifest")
}

/// Build the MiniJinja context: form inputs + derived `package_name`, `year`,
/// `branch_conventions`, `department`, `users`.
#[must_use]
pub fn derive_context(_req: &InitRequest) -> serde_json::Map<String, serde_json::Value> {
    todo!("Fleet-Blueprint-RS: derive the render context")
}

/// Render the template tree into an in-memory file set per the renderer rules above.
///
/// # Errors
/// [`keel_core::KeelError::Render`] on any template/IO failure.
pub fn render(_manifest: &Manifest, _blueprint_dir: &Path, _req: &InitRequest) -> Result<Vec<RenderedFile>> {
    todo!("Fleet-Blueprint-RS: render template/ with MiniJinja per the frozen rules")
}

/// Derive a keyword-safe Python/Rust package name from a project name (`-` → `_`).
/// Public because both the renderer and tests rely on the exact rule.
#[must_use]
pub fn to_package_name(project_name: &str) -> String {
    let mut s: String = project_name
        .chars()
        .map(|c| if c == '-' { '_' } else { c.to_ascii_lowercase() })
        .collect();
    // Avoid leading digit and Python keywords producing an invalid module name.
    const KEYWORDS: &[&str] = &[
        "class", "def", "return", "import", "from", "as", "if", "else", "elif", "for", "while",
        "try", "except", "finally", "with", "lambda", "global", "nonlocal", "pass", "yield",
        "async", "await", "and", "or", "not", "is", "in", "raise", "assert", "del", "none", "true",
        "false",
    ];
    if s.chars().next().is_some_and(|c| c.is_ascii_digit()) || KEYWORDS.contains(&s.as_str()) {
        s.push('_');
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_name_replaces_hyphens() {
        assert_eq!(to_package_name("invoicing-api"), "invoicing_api");
    }

    proptest::proptest! {
        #[test]
        fn package_name_is_hyphen_free_and_idempotent(name in "[a-z][a-z0-9-]{2,40}") {
            let p = to_package_name(&name);
            proptest::prop_assert!(!p.contains('-'));
            proptest::prop_assert_eq!(&p, &to_package_name(&p));
        }
    }
}
