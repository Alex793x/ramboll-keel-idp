//! # keel-blueprint
//!
//! Loads a blueprint manifest (`blueprint.yaml`, schema `keel/v2`), validates an [`InitRequest`]
//! against it, derives the rendering context, and renders the `template/` tree with MiniJinja.
//!
//! **Renderer rules (frozen contract):**
//! - Path segments interpolate `{{ … }}` **always**.
//! - File **contents** are rendered through MiniJinja **only if the filename ends in `.j2`** (the
//!   suffix is then stripped); every other file is copied **verbatim** so GitHub Actions `${{ … }}`
//!   expressions survive untouched.
//! - `template.conditions` may include/exclude paths based on a `when` expression.

#![forbid(unsafe_code)]

mod context;
mod manifest;
mod renderer;

use std::path::Path;

use keel_core::{InitRequest, KeelError, RenderedFile, Result};
use serde::{Deserialize, Serialize};

pub use context::{derive_context, derive_context_v3, ServiceCtx};

/// A parsed blueprint manifest (`keel/v2`).
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
    /// `template.root` (default `"template"`), `rename` suffix, and conditional path rules.
    #[serde(default)]
    pub template: TemplateSpec,
    /// Ordered post-render workflow actions (informational; the engine owns execution).
    #[serde(default)]
    pub post_actions: Vec<String>,
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

/// `template:` section of the manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateSpec {
    /// Sub-directory under the blueprint dir holding the tree to render. Default `"template"`.
    pub root: String,
    /// Suffix marking a file whose contents are rendered then stripped. Default `".j2"`.
    pub rename: String,
    /// Conditional include/exclude rules evaluated against rendered destination paths.
    #[serde(default)]
    pub conditions: Vec<Condition>,
}

impl Default for TemplateSpec {
    fn default() -> Self {
        Self {
            root: "template".to_owned(),
            rename: ".j2".to_owned(),
            conditions: Vec::new(),
        }
    }
}

/// One conditional rule: the listed `paths` are included only when `when` evaluates truthy
/// (otherwise excluded). Paths are compared against the **rendered** destination path.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Condition {
    /// A MiniJinja boolean expression, e.g. `"service_kind == 'rest-api'"`.
    pub when: String,
    /// Destination paths (after `{{ }}` interpolation, no `.j2`) governed by this rule.
    #[serde(default)]
    pub paths: Vec<String>,
}

/// Load and parse `<blueprint_dir>/blueprint.yaml`.
///
/// # Errors
/// [`keel_core::KeelError::Io`] if unreadable, [`keel_core::KeelError::Validation`] if malformed.
pub fn load_manifest(blueprint_dir: &Path) -> Result<Manifest> {
    let path = blueprint_dir.join("blueprint.yaml");
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| KeelError::Io(format!("reading {}: {e}", path.display())))?;
    manifest::parse(&raw)
}

/// Validate a request against the manifest (required params present, enums/pattern satisfied).
///
/// # Errors
/// [`keel_core::KeelError::Validation`] on any rule violation.
pub fn validate_request(manifest: &Manifest, req: &InitRequest) -> Result<()> {
    manifest::validate(manifest, req)
}

/// Render the template tree into an in-memory file set per the renderer rules above.
///
/// # Errors
/// [`keel_core::KeelError::Render`] on any template/IO failure.
pub fn render(
    manifest: &Manifest,
    blueprint_dir: &Path,
    req: &InitRequest,
) -> Result<Vec<RenderedFile>> {
    renderer::render(manifest, blueprint_dir, req)
}

/// Render the template tree against a pre-built context map (v3 additive entry point, SPEC §12).
///
/// The engine uses this to render service blueprints with a [`derive_context_v3`] context (per
/// service, or the monolith root with the `services` array). Every renderer rule is identical to
/// [`render`]: path interpolation, `.j2` content rendering + suffix strip, verbatim copies, and
/// `template.conditions` — only the context source differs.
///
/// # Errors
/// [`keel_core::KeelError::Render`] on any template/IO failure.
pub fn render_with_context(
    manifest: &Manifest,
    blueprint_dir: &Path,
    ctx: &serde_json::Map<String, serde_json::Value>,
) -> Result<Vec<RenderedFile>> {
    renderer::render_with_context(manifest, blueprint_dir, ctx)
}

/// Derive a keyword-safe Python/Rust package name from a project name (`-` → `_`).
/// Public because both the renderer and tests rely on the exact rule.
#[must_use]
pub fn to_package_name(project_name: &str) -> String {
    let mut s: String = project_name
        .chars()
        .map(|c| {
            if c == '-' {
                '_'
            } else {
                c.to_ascii_lowercase()
            }
        })
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
