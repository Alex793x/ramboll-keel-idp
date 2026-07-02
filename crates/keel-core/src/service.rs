//! v3 multi-service domain: repo layout, service selections, deterministic naming, and the
//! `keel.services.json` manifest (SPEC §11).
//!
//! The naming rule is the load-bearing contract shared with the hub's `wizard-model.ts`:
//! a service type appearing **once** gets no ordinal (`{slug}-{tag}`); a type appearing `k > 1`
//! times gets 1-based ordinals in selection order (`{slug}-{tag}-1` … `-{k}`). Monolith service
//! directories follow the same rule without the slug prefix (`{tag}` / `{tag}-{n}`).

use serde::{Deserialize, Serialize};

use crate::{KeelError, Result};

/// How a multi-service project materializes on GitHub.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RepoLayout {
    /// One repository per service (the classic golden path).
    #[default]
    MultiRepo,
    /// A single repository with `services/{dir}/` per service and change-aware CI.
    Monolith,
}

impl RepoLayout {
    /// The wire/template token (`"multi-repo"` / `"monolith"`).
    #[must_use]
    pub fn as_token(self) -> &'static str {
        match self {
            RepoLayout::MultiRepo => "multi-repo",
            RepoLayout::Monolith => "monolith",
        }
    }
}

impl std::str::FromStr for RepoLayout {
    type Err = KeelError;
    fn from_str(s: &str) -> Result<Self> {
        match s {
            "multi-repo" | "multirepo" | "multi_repo" => Ok(RepoLayout::MultiRepo),
            "monolith" | "mono" => Ok(RepoLayout::Monolith),
            other => Err(KeelError::Validation(format!(
                "unknown layout: {other:?} (expected \"multi-repo\" or \"monolith\")"
            ))),
        }
    }
}

/// The five service component types of the hub wizard (design `TYPES`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceType {
    Fe,
    Api,
    Wk,
    Dp,
    Inf,
}

impl ServiceType {
    /// The short lowercase tag used in repo names, monolith dirs, and blueprint dirs.
    #[must_use]
    pub fn tag(self) -> &'static str {
        match self {
            ServiceType::Fe => "fe",
            ServiceType::Api => "api",
            ServiceType::Wk => "wk",
            ServiceType::Dp => "dp",
            ServiceType::Inf => "inf",
        }
    }

    /// Human label (matches the design's type cards).
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            ServiceType::Fe => "Frontend",
            ServiceType::Api => "Backend API",
            ServiceType::Wk => "Worker",
            ServiceType::Dp => "Data pipeline",
            ServiceType::Inf => "Infrastructure",
        }
    }

    /// All types, in the design's card order.
    #[must_use]
    pub fn all() -> [ServiceType; 5] {
        [
            ServiceType::Fe,
            ServiceType::Api,
            ServiceType::Wk,
            ServiceType::Dp,
            ServiceType::Inf,
        ]
    }
}

impl std::str::FromStr for ServiceType {
    type Err = KeelError;
    fn from_str(s: &str) -> Result<Self> {
        match s {
            "fe" => Ok(ServiceType::Fe),
            "api" => Ok(ServiceType::Api),
            "wk" => Ok(ServiceType::Wk),
            "dp" => Ok(ServiceType::Dp),
            "inf" => Ok(ServiceType::Inf),
            other => Err(KeelError::Validation(format!(
                "unknown service type: {other:?} (expected fe|api|wk|dp|inf)"
            ))),
        }
    }
}

/// One chosen service component: a type plus a language slug (e.g. `api` + `python`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServiceSelection {
    #[serde(rename = "type")]
    pub service_type: ServiceType,
    /// Language slug: react|vue|blazor|dotnet|python|node|go|dbt|spark|terraform|bicep.
    #[serde(rename = "lang")]
    pub language: String,
}

impl ServiceSelection {
    /// Parse the CLI form `"{type}:{lang}"`, e.g. `"api:python"`.
    ///
    /// # Errors
    /// [`KeelError::Validation`] on a malformed pair, unknown type, or invalid language slug.
    pub fn parse(s: &str) -> Result<Self> {
        let (t, lang) = s.split_once(':').ok_or_else(|| {
            KeelError::Validation(format!(
                "invalid service {s:?} (expected \"type:lang\", e.g. \"api:python\")"
            ))
        })?;
        let service_type: ServiceType = t.trim().parse()?;
        let language = lang.trim().to_owned();
        if !is_valid_language_slug(&language) {
            return Err(KeelError::Validation(format!(
                "invalid language slug {language:?} (lowercase [a-z0-9-], non-empty)"
            )));
        }
        Ok(Self {
            service_type,
            language,
        })
    }

    /// The blueprint directory name for this selection: `{tag}-{lang}` (under `blueprints/services/`).
    #[must_use]
    pub fn blueprint_name(&self) -> String {
        format!("{}-{}", self.service_type.tag(), self.language)
    }
}

/// Language slugs are non-empty lowercase `[a-z0-9-]`, no leading/trailing hyphen.
#[must_use]
pub fn is_valid_language_slug(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with('-')
        && !s.ends_with('-')
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Per-selection name suffixes implementing the shared ordinal rule (see module docs).
fn ordinal_suffixes(services: &[ServiceSelection]) -> Vec<String> {
    let mut totals: std::collections::HashMap<ServiceType, u32> = std::collections::HashMap::new();
    for s in services {
        *totals.entry(s.service_type).or_default() += 1;
    }
    let mut seen: std::collections::HashMap<ServiceType, u32> = std::collections::HashMap::new();
    services
        .iter()
        .map(|s| {
            let n = seen.entry(s.service_type).or_default();
            *n += 1;
            let tag = s.service_type.tag();
            if totals[&s.service_type] > 1 {
                format!("{tag}-{n}")
            } else {
                tag.to_owned()
            }
        })
        .collect()
}

/// Repo names for a multi-repo project: `{slug}-{tag}` or `{slug}-{tag}-{n}` per the ordinal rule.
#[must_use]
pub fn service_repo_names(slug: &str, services: &[ServiceSelection]) -> Vec<String> {
    ordinal_suffixes(services)
        .into_iter()
        .map(|sfx| format!("{slug}-{sfx}"))
        .collect()
}

/// Monolith `services/` directory names: `{tag}` or `{tag}-{n}` per the ordinal rule.
#[must_use]
pub fn service_dirs(services: &[ServiceSelection]) -> Vec<String> {
    ordinal_suffixes(services)
}

/// The default single-service selection for a bare init (no explicit `services`): the legacy
/// `service_kind` maps onto the Python golden path — REST API → `api:python`, worker → `wk:python`.
/// This is what lets the components model be the *only* path (there is no separate `python-service`
/// blueprint): a plain init is just a one-service multi-repo project.
#[must_use]
pub fn default_services(service_kind: crate::ServiceKind) -> Vec<ServiceSelection> {
    let service_type = match service_kind {
        crate::ServiceKind::RestApi => ServiceType::Api,
        crate::ServiceKind::Worker => ServiceType::Wk,
    };
    vec![ServiceSelection {
        service_type,
        language: "python".to_owned(),
    }]
}

// ─────────────────────────────────────────────────────────────────────────────
// keel.services.json — the monolith's machine-readable service registry
// ─────────────────────────────────────────────────────────────────────────────

/// One service entry in `keel.services.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServiceEntry {
    /// Directory under `services/` (e.g. `"api"`, `"api-2"`).
    pub dir: String,
    #[serde(rename = "type")]
    pub service_type: ServiceType,
    #[serde(rename = "lang")]
    pub language: String,
    /// Human-readable name (`{ServiceType::label}`).
    pub name: String,
    /// Dirs of services this one depends on — changes there also rebuild this service.
    #[serde(default)]
    pub depends_on: Vec<String>,
}

/// The `keel.services.json` document the engine commits into every monolith repo. The smart CI's
/// `detect_services.py` resolves changed paths against exactly this structure (SPEC §15).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServicesManifest {
    pub version: u32,
    pub project: String,
    /// Path PREFIXES that affect every service (checked with `str::starts_with` semantics).
    pub shared_paths: Vec<String>,
    pub services: Vec<ServiceEntry>,
}

impl ServicesManifest {
    /// Default shared prefixes: workflow/tooling changes and the manifest itself hit all services.
    #[must_use]
    pub fn default_shared_paths() -> Vec<String> {
        vec![
            ".github/".to_owned(),
            "keel.services.json".to_owned(),
            "libs/".to_owned(),
        ]
    }

    /// Build the manifest for a project's selections (dirs follow the shared ordinal rule).
    #[must_use]
    pub fn new(project: &str, services: &[ServiceSelection]) -> Self {
        let dirs = service_dirs(services);
        let entries = services
            .iter()
            .zip(dirs)
            .map(|(s, dir)| ServiceEntry {
                dir,
                service_type: s.service_type,
                language: s.language.clone(),
                name: s.service_type.label().to_owned(),
                depends_on: Vec::new(),
            })
            .collect();
        Self {
            version: 1,
            project: project.to_owned(),
            shared_paths: Self::default_shared_paths(),
            services: entries,
        }
    }

    /// Serialize as the committed `keel.services.json` (pretty, trailing newline).
    ///
    /// # Errors
    /// [`KeelError::Io`] only if serde fails (structurally impossible for valid manifests).
    pub fn to_json(&self) -> Result<Vec<u8>> {
        let mut out = serde_json::to_vec_pretty(self)
            .map_err(|e| KeelError::Io(format!("serializing keel.services.json: {e}")))?;
        out.push(b'\n');
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn sel(t: ServiceType, lang: &str) -> ServiceSelection {
        ServiceSelection {
            service_type: t,
            language: lang.to_owned(),
        }
    }

    #[test]
    fn default_services_maps_service_kind_to_the_python_golden_path() {
        use crate::ServiceKind;
        assert_eq!(
            default_services(ServiceKind::RestApi),
            vec![sel(ServiceType::Api, "python")]
        );
        assert_eq!(
            default_services(ServiceKind::Worker),
            vec![sel(ServiceType::Wk, "python")]
        );
    }

    #[test]
    fn parse_accepts_valid_pairs_and_rejects_garbage() {
        let s = ServiceSelection::parse("api:python").expect("valid");
        assert_eq!(s.service_type, ServiceType::Api);
        assert_eq!(s.language, "python");
        assert_eq!(s.blueprint_name(), "api-python");
        assert!(ServiceSelection::parse("api").is_err());
        assert!(ServiceSelection::parse("gpu:python").is_err());
        assert!(ServiceSelection::parse("api:").is_err());
        assert!(ServiceSelection::parse("api:Py thon").is_err());
    }

    #[test]
    fn layout_tokens_round_trip() {
        assert_eq!(
            "monolith".parse::<RepoLayout>().unwrap(),
            RepoLayout::Monolith
        );
        assert_eq!(
            "multi-repo".parse::<RepoLayout>().unwrap(),
            RepoLayout::MultiRepo
        );
        assert_eq!(RepoLayout::default(), RepoLayout::MultiRepo);
        assert!("solo".parse::<RepoLayout>().is_err());
    }

    #[test]
    fn ordinal_rule_matches_the_wizard_model() {
        // Singles unsuffixed; repeats numbered 1..k in order — mirrors hub wizard-model.ts.
        let services = vec![
            sel(ServiceType::Api, "python"),
            sel(ServiceType::Fe, "react"),
            sel(ServiceType::Api, "node"),
        ];
        assert_eq!(
            service_repo_names("demo", &services),
            vec!["demo-api-1", "demo-fe", "demo-api-2"]
        );
        assert_eq!(service_dirs(&services), vec!["api-1", "fe", "api-2"]);
    }

    #[test]
    fn manifest_new_builds_entries_with_default_shared_paths() {
        let services = vec![
            sel(ServiceType::Api, "python"),
            sel(ServiceType::Fe, "react"),
        ];
        let m = ServicesManifest::new("demo", &services);
        assert_eq!(m.version, 1);
        assert_eq!(m.services.len(), 2);
        assert_eq!(m.services[0].dir, "api");
        assert_eq!(m.services[1].dir, "fe");
        assert!(m.shared_paths.iter().any(|p| p == ".github/"));
        let json = String::from_utf8(m.to_json().unwrap()).unwrap();
        assert!(json.contains("\"keel.services.json\""));
        assert!(json.ends_with('\n'));
    }

    // ── properties ───────────────────────────────────────────────────────────

    fn arb_service() -> impl Strategy<Value = ServiceSelection> {
        (
            prop_oneof![
                Just(ServiceType::Fe),
                Just(ServiceType::Api),
                Just(ServiceType::Wk),
                Just(ServiceType::Dp),
                Just(ServiceType::Inf)
            ],
            "[a-z][a-z0-9]{0,8}",
        )
            .prop_map(|(t, lang)| ServiceSelection {
                service_type: t,
                language: lang,
            })
    }

    proptest! {
        /// Repo names are unique and every one satisfies the project-name pattern.
        #[test]
        fn repo_names_unique_and_valid(services in proptest::collection::vec(arb_service(), 1..10)) {
            let names = service_repo_names("demo-svc", &services);
            let uniq: std::collections::HashSet<_> = names.iter().collect();
            prop_assert_eq!(uniq.len(), names.len(), "names must be unique");
            for n in &names {
                prop_assert!(crate::is_valid_project_name(n), "invalid repo name {}", n);
            }
        }

        /// Dirs are unique, stable under re-derivation, and aligned index-for-index with names.
        #[test]
        fn dirs_unique_stable_and_aligned(services in proptest::collection::vec(arb_service(), 1..10)) {
            let dirs = service_dirs(&services);
            let again = service_dirs(&services);
            prop_assert_eq!(&dirs, &again, "derivation must be deterministic");
            let uniq: std::collections::HashSet<_> = dirs.iter().collect();
            prop_assert_eq!(uniq.len(), dirs.len(), "dirs must be unique");
            let names = service_repo_names("p", &services);
            for (d, n) in dirs.iter().zip(&names) {
                prop_assert_eq!(&format!("p-{d}"), n, "dir/name rule must agree");
            }
        }

        /// The manifest round-trips through its own JSON and covers every selection exactly once.
        #[test]
        fn manifest_round_trips(services in proptest::collection::vec(arb_service(), 1..10)) {
            let m = ServicesManifest::new("demo", &services);
            prop_assert_eq!(m.services.len(), services.len());
            let json = m.to_json().unwrap();
            let back: ServicesManifest = serde_json::from_slice(&json).unwrap();
            prop_assert_eq!(back, m);
        }
    }
}
