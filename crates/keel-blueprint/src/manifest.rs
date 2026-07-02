//! Manifest parsing (YAML → flat [`Manifest`]) and request validation.
//!
//! The on-disk `blueprint.yaml` is nested (`metadata:{…}`, `template:{…}`, `repository:{…}`)
//! and uses `apiVersion`-style keys. We deserialize into a private "raw" struct that matches the
//! YAML shape exactly, then convert it into the flat public [`Manifest`].

use keel_core::{InitRequest, KeelError, ProtectionPolicy, Result};
use serde::Deserialize;

use crate::{Condition, Manifest, Parameter, RepositorySpec, TemplateSpec};

// ─────────────────────────────────────────────────────────────────────────────
// Raw YAML shape
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct RawManifest {
    #[serde(rename = "apiVersion")]
    api_version: String,
    kind: String,
    metadata: RawMetadata,
    #[serde(default)]
    parameters: Vec<RawParameter>,
    #[serde(default)]
    template: Option<RawTemplate>,
    #[serde(default)]
    repository: Option<RawRepository>,
    #[serde(default, rename = "postActions")]
    post_actions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RawMetadata {
    name: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    owner: String,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RawParameter {
    id: String,
    #[serde(default)]
    title: String,
    /// YAML `type` → [`Parameter::kind`].
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    required: bool,
    #[serde(default)]
    pattern: Option<String>,
    #[serde(default)]
    values: Vec<String>,
    #[serde(default)]
    default: Option<String>,
    #[serde(default)]
    help: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawTemplate {
    #[serde(default)]
    root: Option<String>,
    #[serde(default)]
    rename: Option<String>,
    #[serde(default)]
    conditions: Vec<RawCondition>,
}

#[derive(Debug, Deserialize)]
struct RawCondition {
    when: String,
    #[serde(default)]
    paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RawRepository {
    #[serde(default)]
    visibility: Option<String>,
    #[serde(default)]
    default_branch: Option<String>,
    #[serde(default)]
    branches: Vec<String>,
    #[serde(default)]
    protect: Vec<RawProtect>,
}

#[derive(Debug, Deserialize)]
struct RawProtect {
    branch: String,
    /// Parsed for schema completeness; `ProtectionPolicy` has no dedicated field (a required
    /// review count of >= 1 already implies PRs are required).
    #[serde(default, rename = "require_pull_request")]
    _require_pull_request: bool,
    #[serde(default)]
    required_reviews: u8,
    #[serde(default)]
    require_codeowners: bool,
    #[serde(default)]
    required_checks: Vec<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

/// Parse the YAML text of a `blueprint.yaml` into a flat [`Manifest`].
pub(crate) fn parse(yaml: &str) -> Result<Manifest> {
    let raw: RawManifest = serde_yaml::from_str(yaml)
        .map_err(|e| KeelError::Validation(format!("malformed blueprint.yaml: {e}")))?;
    Ok(convert(raw))
}

fn convert(raw: RawManifest) -> Manifest {
    let RawManifest {
        api_version,
        kind,
        metadata,
        parameters,
        template,
        repository,
        post_actions,
    } = raw;

    Manifest {
        api_version,
        kind,
        name: metadata.name,
        title: metadata.title,
        description: metadata.description,
        version: metadata.version,
        owner: metadata.owner,
        tags: metadata.tags,
        parameters: parameters.into_iter().map(convert_parameter).collect(),
        repository: repository.map(convert_repository).unwrap_or_default(),
        template: template.map(convert_template).unwrap_or_default(),
        post_actions,
    }
}

fn convert_parameter(p: RawParameter) -> Parameter {
    Parameter {
        id: p.id,
        title: p.title,
        kind: p.kind,
        required: p.required,
        pattern: p.pattern,
        values: p.values,
        default: p.default,
        help: p.help,
    }
}

fn convert_template(t: RawTemplate) -> TemplateSpec {
    let default = TemplateSpec::default();
    TemplateSpec {
        root: t.root.filter(|s| !s.is_empty()).unwrap_or(default.root),
        rename: t.rename.filter(|s| !s.is_empty()).unwrap_or(default.rename),
        conditions: t
            .conditions
            .into_iter()
            .map(|c| Condition {
                when: c.when,
                paths: c.paths,
            })
            .collect(),
    }
}

fn convert_repository(r: RawRepository) -> RepositorySpec {
    // `visibility` is captured but the flat spec has no field for it (engine/github own that);
    // bind it to silence dead-code without exposing it.
    let _ = r.visibility;
    RepositorySpec {
        default_branch: r.default_branch.unwrap_or_else(|| "main".to_owned()),
        branches: r.branches,
        protect: r
            .protect
            .into_iter()
            .map(|p| ProtectionPolicy {
                branch: p.branch,
                required_reviews: p.required_reviews,
                require_codeowners: p.require_codeowners,
                required_checks: p.required_checks,
            })
            .collect(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/// Validate a request against the manifest. Cheap structural checks run first
/// ([`InitRequest::validate_basic`]), then each required manifest parameter is checked against the
/// corresponding field of the [`InitRequest`].
pub(crate) fn validate(manifest: &Manifest, req: &InitRequest) -> Result<()> {
    req.validate_basic()?;

    for param in manifest.parameters.iter().filter(|p| p.required) {
        check_param(param, req)?;
    }
    Ok(())
}

fn check_param(param: &Parameter, req: &InitRequest) -> Result<()> {
    match param.id.as_str() {
        "project_name" => {
            // The manifest pattern is the canonical project-name rule. We enforce the shared
            // keel-core rule (identical semantics) plus the manifest pattern's anchored shape via
            // the lightweight matcher below.
            if !keel_core::is_valid_project_name(&req.project_name) {
                return Err(KeelError::Validation(format!(
                    "project_name {:?} is invalid for parameter {:?}",
                    req.project_name, param.id
                )));
            }
            if let Some(pattern) = &param.pattern {
                if !matches_anchored_pattern(pattern, &req.project_name) {
                    return Err(KeelError::Validation(format!(
                        "project_name {:?} does not match manifest pattern {pattern:?}",
                        req.project_name
                    )));
                }
            }
            Ok(())
        }
        "service_kind" => {
            let token = req.service_kind.as_token();
            if !param.values.is_empty() && !param.values.iter().any(|v| v == token) {
                return Err(KeelError::Validation(format!(
                    "service_kind {token:?} not in allowed values {:?}",
                    param.values
                )));
            }
            Ok(())
        }
        "description" => non_empty(&req.description, "description"),
        "author" => non_empty(&req.author, "author"),
        // `owning_team` (and any future required param) is satisfied by the selected department's
        // team slug, which is always present on a well-formed request.
        "owning_team" => non_empty(
            &req.department.team_slug,
            "owning_team (department.team_slug)",
        ),
        // Unknown required params: best-effort — a present department/users covers ownership; we do
        // not fail on parameters the InitRequest has no field for.
        _ => Ok(()),
    }
}

fn non_empty(value: &str, label: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(KeelError::Validation(format!("{label} must not be empty")));
    }
    Ok(())
}

/// Match the canonical project-name pattern `^[a-z][a-z0-9-]{2,40}$` without pulling in a regex
/// crate. We only support exactly this anchored pattern (the one shipped by the blueprint); any
/// other pattern is treated as satisfied so we never reject on a pattern we cannot interpret.
fn matches_anchored_pattern(pattern: &str, value: &str) -> bool {
    if pattern == keel_core::PROJECT_NAME_PATTERN || pattern == "^[a-z][a-z0-9-]{2,40}$" {
        return keel_core::is_valid_project_name(value);
    }
    // Unknown pattern shape: do not reject (manifest authors own the regex; keel-core already
    // enforced the structural rule above for project_name).
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use keel_core::{Department, ServiceKind, User};

    const SAMPLE_YAML: &str = r#"
apiVersion: keel/v1
kind: Blueprint
metadata:
  name: python-service
  title: Python Service
  description: golden path
  version: "1.0.0"
  owner: platform-engineering
  tags: [python, service]
parameters:
  - id: project_name
    title: Project name
    type: string
    required: true
    pattern: "^[a-z][a-z0-9-]{2,40}$"
  - id: service_kind
    title: Service kind
    type: enum
    required: true
    values: [rest-api, worker]
    default: rest-api
  - id: description
    title: Description
    type: string
    required: true
  - id: author
    title: Author
    type: string
    required: true
template:
  root: template
  rename: ".j2"
  conditions:
    - when: "service_kind == 'rest-api'"
      paths:
        - "src/{{ package_name }}/api.py"
repository:
  visibility: internal
  default_branch: main
  branches: [main, dev, staging]
  protect:
    - branch: main
      require_pull_request: true
      required_reviews: 1
      require_codeowners: true
      required_checks: [build, test, validate]
"#;

    fn valid_request() -> InitRequest {
        InitRequest {
            project_name: "invoicing-api".into(),
            blueprint: "python-service".into(),
            department: Department {
                id: "d1".into(),
                name: "Buildings".into(),
                team_slug: "buildings".into(),
            },
            users: vec![User {
                id: "u1".into(),
                name: "Ada".into(),
                email: "ada@ramboll.com".into(),
                github_login: "ada".into(),
            }],
            service_kind: ServiceKind::RestApi,
            description: "Handles invoices.".into(),
            author: "Ada Lovelace".into(),
            layout: keel_core::RepoLayout::default(),
            services: vec![],
        }
    }

    #[test]
    fn parses_sample_yaml_into_flat_manifest() {
        let m = parse(SAMPLE_YAML).unwrap();
        assert_eq!(m.api_version, "keel/v1");
        assert_eq!(m.name, "python-service");
        assert_eq!(m.title, "Python Service");
        assert_eq!(m.version, "1.0.0");
        assert_eq!(m.parameters.len(), 4);
        // type → kind mapping.
        let sk = m
            .parameters
            .iter()
            .find(|p| p.id == "service_kind")
            .unwrap();
        assert_eq!(sk.kind, "enum");
        assert_eq!(sk.values, vec!["rest-api", "worker"]);
        // repository + protection mapping.
        assert_eq!(m.repository.default_branch, "main");
        assert_eq!(m.repository.branches, vec!["main", "dev", "staging"]);
        assert_eq!(m.repository.protect.len(), 1);
        let p = &m.repository.protect[0];
        assert_eq!(p.branch, "main");
        assert_eq!(p.required_reviews, 1);
        assert!(p.require_codeowners);
        assert_eq!(p.required_checks, vec!["build", "test", "validate"]);
        // template.
        assert_eq!(m.template.root, "template");
        assert_eq!(m.template.rename, ".j2");
        assert_eq!(m.template.conditions.len(), 1);
        assert_eq!(m.template.conditions[0].when, "service_kind == 'rest-api'");
    }

    #[test]
    fn template_defaults_when_absent() {
        let yaml = r#"
apiVersion: keel/v1
kind: Blueprint
metadata:
  name: x
parameters: []
"#;
        let m = parse(yaml).unwrap();
        assert_eq!(m.template.root, "template");
        assert_eq!(m.template.rename, ".j2");
        assert!(m.template.conditions.is_empty());
    }

    #[test]
    fn accepts_a_valid_request() {
        let m = parse(SAMPLE_YAML).unwrap();
        validate(&m, &valid_request()).unwrap();
    }

    #[test]
    fn rejects_bad_project_name() {
        let m = parse(SAMPLE_YAML).unwrap();
        let mut req = valid_request();
        req.project_name = "Bad_Name".into();
        assert!(validate(&m, &req).is_err());
    }

    #[test]
    fn rejects_missing_required_description() {
        let m = parse(SAMPLE_YAML).unwrap();
        let mut req = valid_request();
        req.description = "   ".into();
        assert!(validate(&m, &req).is_err());
    }

    #[test]
    fn rejects_empty_author() {
        let m = parse(SAMPLE_YAML).unwrap();
        let mut req = valid_request();
        req.author = String::new();
        assert!(validate(&m, &req).is_err());
    }

    #[test]
    fn rejects_when_no_users_selected() {
        let m = parse(SAMPLE_YAML).unwrap();
        let mut req = valid_request();
        req.users.clear();
        assert!(validate(&m, &req).is_err());
    }

    #[test]
    fn service_kind_worker_is_allowed_by_enum() {
        let m = parse(SAMPLE_YAML).unwrap();
        let mut req = valid_request();
        req.service_kind = ServiceKind::Worker;
        validate(&m, &req).unwrap();
    }
}
