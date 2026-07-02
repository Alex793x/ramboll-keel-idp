//! v3 multi-service domain: repo layout, service selections, deterministic naming, and the
//! `keel.services.json` manifest (SPEC §11).
//!
//! The naming rule is the load-bearing contract shared with the hub's `wizard-model.ts`:
//! a service type appearing **once** gets no ordinal (`{slug}-{tag}`); a type appearing `k > 1`
//! times gets 1-based ordinals in selection order (`{slug}-{tag}-1` … `-{k}`). Monolith service
//! directories follow the same rule without the slug prefix (`{tag}` / `{tag}-{n}`).
//!
//! v5 (SPEC §19.1): a selection may carry an explicit `name`. [`resolve_service_names`] is the
//! single naming chokepoint — explicit names win verbatim; unnamed entries keep the v4 ordinal
//! defaults counted **among unnamed entries of that type only**; any duplicate in the final name
//! set is a [`KeelError::Validation`]. With no names given, the output is byte-identical to the
//! v4 ordinals (property-pinned below).

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

/// One chosen service component: a type plus a language slug (e.g. `api` + `python`), and
/// optionally (v5) an explicit component name (e.g. `ingest`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServiceSelection {
    #[serde(rename = "type")]
    pub service_type: ServiceType,
    /// Language slug: react|vue|blazor|dotnet|python|node|go|dbt|spark|terraform|bicep.
    #[serde(rename = "lang")]
    pub language: String,
    /// v5 explicit component name (SPEC §19.1). `None` ⇒ the v4 ordinal default. Additive:
    /// old payloads deserialize to `None` and old-shaped payloads serialize byte-identically.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl ServiceSelection {
    /// Parse the CLI form `"{type}:{lang}"` or `"{type}:{lang}:{name}"`, e.g. `"api:python"`
    /// or `"api:python:ingest"`.
    ///
    /// # Errors
    /// [`KeelError::Validation`] on a malformed entry, unknown type, invalid language slug, or
    /// invalid service name.
    pub fn parse(s: &str) -> Result<Self> {
        let mut parts = s.splitn(3, ':');
        let t = parts.next().unwrap_or_default();
        let Some(lang) = parts.next() else {
            return Err(KeelError::Validation(format!(
                "invalid service {s:?} (expected \"type:lang\" or \"type:lang:name\", \
                 e.g. \"api:python\" or \"api:python:ingest\")"
            )));
        };
        let name = parts.next();
        let service_type: ServiceType = t.trim().parse()?;
        let language = lang.trim().to_owned();
        if !is_valid_language_slug(&language) {
            return Err(KeelError::Validation(format!(
                "invalid language slug {language:?} (lowercase [a-z0-9-], non-empty)"
            )));
        }
        let name = match name {
            Some(n) => {
                let n = n.trim().to_owned();
                if !is_valid_service_name(&n) {
                    return Err(KeelError::Validation(format!(
                        "invalid service name {n:?} (expected {SERVICE_NAME_PATTERN}, \
                         no trailing hyphen)"
                    )));
                }
                Some(n)
            }
            None => None,
        };
        Ok(Self {
            service_type,
            language,
            name,
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

/// The v5 service-name slug rule (SPEC §19.1), shared with the hub's `SERVICE_NAME_RE`.
pub const SERVICE_NAME_PATTERN: &str = "^[a-z][a-z0-9-]{1,29}$";

/// Service names match [`SERVICE_NAME_PATTERN`] (2..=30 chars, lowercase start, `[a-z0-9-]`
/// tail) with no trailing hyphen. Pure check — no regex dependency, mirroring
/// [`is_valid_language_slug`].
#[must_use]
pub fn is_valid_service_name(s: &str) -> bool {
    let len = s.chars().count();
    if !(2..=30).contains(&len) || s.ends_with('-') {
        return false;
    }
    let mut chars = s.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_lowercase()
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Resolve the final component name of every selection — the single v5 naming chokepoint
/// (SPEC §19.1).
///
/// - An explicit `name` wins verbatim (validated against [`is_valid_service_name`]).
/// - Unnamed entries get the v4 ordinal defaults (`{tag}` / `{tag}-{n}`), counted **among
///   unnamed entries of that type only** — so with no names given, the output is byte-identical
///   to the v4 ordinals.
///
/// # Errors
/// [`KeelError::Validation`] on an invalid explicit name, or when the *final* name set contains
/// a duplicate (the message names the collision).
pub fn resolve_service_names(services: &[ServiceSelection]) -> Result<Vec<String>> {
    for s in services {
        if let Some(name) = &s.name {
            if !is_valid_service_name(name) {
                return Err(KeelError::Validation(format!(
                    "invalid service name {name:?} (expected {SERVICE_NAME_PATTERN}, \
                     no trailing hyphen)"
                )));
            }
        }
    }

    // Ordinal totals over UNNAMED entries per type only (explicit names never consume ordinals).
    let mut unnamed_totals: std::collections::HashMap<ServiceType, u32> =
        std::collections::HashMap::new();
    for s in services.iter().filter(|s| s.name.is_none()) {
        *unnamed_totals.entry(s.service_type).or_default() += 1;
    }

    let mut seen: std::collections::HashMap<ServiceType, u32> = std::collections::HashMap::new();
    let mut names: Vec<String> = Vec::with_capacity(services.len());
    for s in services {
        let name = match &s.name {
            Some(explicit) => explicit.clone(),
            None => {
                let n = seen.entry(s.service_type).or_default();
                *n += 1;
                let tag = s.service_type.tag();
                if unnamed_totals.get(&s.service_type).copied().unwrap_or(0) > 1 {
                    format!("{tag}-{n}")
                } else {
                    tag.to_owned()
                }
            }
        };
        names.push(name);
    }

    // Any duplicate in the FINAL set is a validation error naming the collision.
    let mut first_index: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for (i, name) in names.iter().enumerate() {
        if let Some(&j) = first_index.get(name.as_str()) {
            return Err(KeelError::Validation(format!(
                "duplicate service name {name:?} (service #{} collides with service #{})",
                j + 1,
                i + 1
            )));
        }
        first_index.insert(name.as_str(), i);
    }
    Ok(names)
}

/// Repo names for a multi-repo project: `{slug}-{name}` per [`resolve_service_names`]
/// (`{slug}-{tag}` / `{slug}-{tag}-{n}` when no explicit names are given — the v4 rule).
///
/// # Errors
/// Propagates [`resolve_service_names`] validation errors (invalid or duplicate names).
pub fn service_repo_names(slug: &str, services: &[ServiceSelection]) -> Result<Vec<String>> {
    Ok(resolve_service_names(services)?
        .into_iter()
        .map(|name| format!("{slug}-{name}"))
        .collect())
}

/// Monolith `services/` directory names per [`resolve_service_names`] (`{tag}` / `{tag}-{n}`
/// when no explicit names are given — the v4 rule).
///
/// # Errors
/// Propagates [`resolve_service_names`] validation errors (invalid or duplicate names).
pub fn service_dirs(services: &[ServiceSelection]) -> Result<Vec<String>> {
    resolve_service_names(services)
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
        name: None,
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

    /// Build the manifest for a project's selections (dirs follow the shared naming rule —
    /// explicit v5 names win, otherwise the v4 ordinals).
    ///
    /// # Errors
    /// Propagates [`resolve_service_names`] validation errors (invalid or duplicate names).
    pub fn new(project: &str, services: &[ServiceSelection]) -> Result<Self> {
        let dirs = service_dirs(services)?;
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
        Ok(Self {
            version: 1,
            project: project.to_owned(),
            shared_paths: Self::default_shared_paths(),
            services: entries,
        })
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
            name: None,
        }
    }

    fn named(t: ServiceType, lang: &str, name: &str) -> ServiceSelection {
        ServiceSelection {
            service_type: t,
            language: lang.to_owned(),
            name: Some(name.to_owned()),
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
        assert_eq!(s.name, None);
        assert_eq!(s.blueprint_name(), "api-python");
        assert!(ServiceSelection::parse("api").is_err());
        assert!(ServiceSelection::parse("gpu:python").is_err());
        assert!(ServiceSelection::parse("api:").is_err());
        assert!(ServiceSelection::parse("api:Py thon").is_err());
    }

    #[test]
    fn parse_accepts_the_three_segment_named_form() {
        let s = ServiceSelection::parse("api:python:ingest").expect("valid named form");
        assert_eq!(s.service_type, ServiceType::Api);
        assert_eq!(s.language, "python");
        assert_eq!(s.name.as_deref(), Some("ingest"));
        // Invalid names are rejected: uppercase, too short, trailing hyphen, leading digit.
        assert!(ServiceSelection::parse("api:python:Ingest").is_err());
        assert!(ServiceSelection::parse("api:python:x").is_err());
        assert!(ServiceSelection::parse("api:python:ingest-").is_err());
        assert!(ServiceSelection::parse("api:python:1ngest").is_err());
        assert!(ServiceSelection::parse("api:python:").is_err());
    }

    #[test]
    fn service_name_rule_matches_the_spec_slug() {
        assert!(is_valid_service_name("ingest"));
        assert!(is_valid_service_name("ab"));
        assert!(is_valid_service_name("a2-b3"));
        assert!(is_valid_service_name(&format!("a{}", "b".repeat(29)))); // 30 chars
        assert!(!is_valid_service_name("a")); // too short
        assert!(!is_valid_service_name(&format!("a{}", "b".repeat(30)))); // 31 chars
        assert!(!is_valid_service_name("Ingest")); // uppercase
        assert!(!is_valid_service_name("1ngest")); // digit start
        assert!(!is_valid_service_name("ingest-")); // trailing hyphen
        assert!(!is_valid_service_name("in_gest")); // underscore
        assert!(!is_valid_service_name("")); // empty
    }

    #[test]
    fn selection_serde_is_additive() {
        // Old 2-field payloads deserialize (name = None) and serialize byte-identically.
        let old = r#"{"type":"api","lang":"python"}"#;
        let s: ServiceSelection = serde_json::from_str(old).expect("old payload parses");
        assert_eq!(s.name, None);
        assert_eq!(serde_json::to_string(&s).expect("serialize"), old);
        // Named payloads round-trip.
        let named_json = r#"{"type":"api","lang":"python","name":"ingest"}"#;
        let s: ServiceSelection = serde_json::from_str(named_json).expect("named payload parses");
        assert_eq!(s.name.as_deref(), Some("ingest"));
        assert_eq!(serde_json::to_string(&s).expect("serialize"), named_json);
    }

    #[test]
    fn resolve_explicit_names_win_and_unnamed_keep_ordinals() {
        let services = vec![
            sel(ServiceType::Api, "python"),
            named(ServiceType::Api, "node", "ingest"),
            sel(ServiceType::Api, "python"),
            sel(ServiceType::Fe, "react"),
        ];
        // Two UNNAMED api entries ⇒ api-1/api-2; the named one never consumes an ordinal.
        assert_eq!(
            resolve_service_names(&services).expect("valid"),
            vec!["api-1", "ingest", "api-2", "fe"]
        );
        assert_eq!(
            service_repo_names("demo", &services).expect("valid"),
            vec!["demo-api-1", "demo-ingest", "demo-api-2", "demo-fe"]
        );
        assert_eq!(
            service_dirs(&services).expect("valid"),
            vec!["api-1", "ingest", "api-2", "fe"]
        );
    }

    #[test]
    fn resolve_rejects_duplicates_naming_the_collision() {
        // Explicit vs explicit.
        let err = resolve_service_names(&[
            named(ServiceType::Api, "python", "ingest"),
            named(ServiceType::Fe, "react", "ingest"),
        ])
        .expect_err("duplicate explicit names");
        assert!(matches!(err, KeelError::Validation(_)), "got {err:?}");
        assert!(err.to_string().contains("ingest"), "{err}");
        // Explicit name colliding with an ordinal default.
        let err = resolve_service_names(&[
            sel(ServiceType::Api, "python"),
            named(ServiceType::Fe, "react", "api"),
        ])
        .expect_err("explicit name shadows the ordinal default");
        assert!(err.to_string().contains("\"api\""), "{err}");
    }

    #[test]
    fn resolve_rejects_invalid_explicit_names() {
        let err = resolve_service_names(&[named(ServiceType::Api, "python", "Bad-Name")])
            .expect_err("invalid slug");
        assert!(matches!(err, KeelError::Validation(_)), "got {err:?}");
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
            service_repo_names("demo", &services).expect("no names is always valid"),
            vec!["demo-api-1", "demo-fe", "demo-api-2"]
        );
        assert_eq!(
            service_dirs(&services).expect("no names is always valid"),
            vec!["api-1", "fe", "api-2"]
        );
    }

    #[test]
    fn manifest_new_builds_entries_with_default_shared_paths() {
        let services = vec![
            sel(ServiceType::Api, "python"),
            sel(ServiceType::Fe, "react"),
        ];
        let m = ServicesManifest::new("demo", &services).expect("valid selections");
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

    fn arb_type() -> impl Strategy<Value = ServiceType> {
        prop_oneof![
            Just(ServiceType::Fe),
            Just(ServiceType::Api),
            Just(ServiceType::Wk),
            Just(ServiceType::Dp),
            Just(ServiceType::Inf)
        ]
    }

    fn arb_service() -> impl Strategy<Value = ServiceSelection> {
        (arb_type(), "[a-z][a-z0-9]{0,8}").prop_map(|(t, lang)| ServiceSelection {
            service_type: t,
            language: lang,
            name: None,
        })
    }

    /// A valid explicit v5 name that can never collide with an ordinal default (`x-` prefix —
    /// no service tag starts with `x`), so mixed-name vectors always resolve.
    fn arb_named_service() -> impl Strategy<Value = ServiceSelection> {
        (arb_type(), "[a-z][a-z0-9]{0,8}", "x-[a-z0-9]{1,20}").prop_map(|(t, lang, name)| {
            ServiceSelection {
                service_type: t,
                language: lang,
                name: Some(name),
            }
        })
    }

    /// Mixed vectors: unnamed entries plus explicit names drawn from a distinct-by-construction
    /// pool (an `x-{index}-…` prefix), so the final set is always collision-free.
    fn arb_mixed_services() -> impl Strategy<Value = Vec<ServiceSelection>> {
        proptest::collection::vec(
            (arb_type(), "[a-z][a-z0-9]{0,8}", proptest::bool::ANY),
            1..10,
        )
        .prop_map(|entries| {
            entries
                .into_iter()
                .enumerate()
                .map(|(i, (t, lang, use_name))| ServiceSelection {
                    service_type: t,
                    language: lang,
                    name: use_name.then(|| format!("x-{i}")),
                })
                .collect()
        })
    }

    /// The FROZEN v4 ordinal algorithm, copied verbatim as the regression oracle
    /// (pre-v5 `ordinal_suffixes`). Do not "fix" this — it pins v4 behavior.
    fn v4_ordinal_suffixes(services: &[ServiceSelection]) -> Vec<String> {
        let mut totals: std::collections::HashMap<ServiceType, u32> =
            std::collections::HashMap::new();
        for s in services {
            *totals.entry(s.service_type).or_default() += 1;
        }
        let mut seen: std::collections::HashMap<ServiceType, u32> =
            std::collections::HashMap::new();
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

    proptest! {
        /// v5 regression guard: with NO names given, resolution is byte-identical to the v4
        /// ordinal algorithm — for `resolve_service_names`, `service_dirs`, AND
        /// `service_repo_names`.
        #[test]
        fn no_names_input_is_byte_identical_to_v4(
            services in proptest::collection::vec(arb_service(), 1..10)
        ) {
            let oracle = v4_ordinal_suffixes(&services);
            prop_assert_eq!(&resolve_service_names(&services).expect("total"), &oracle);
            prop_assert_eq!(&service_dirs(&services).expect("total"), &oracle);
            let repos: Vec<String> = oracle.iter().map(|s| format!("demo-svc-{s}")).collect();
            prop_assert_eq!(service_repo_names("demo-svc", &services).expect("total"), repos);
        }

        /// Resolution is total + deterministic on valid input, collision-free, and preserves
        /// explicit names verbatim at their positions.
        #[test]
        fn resolution_total_deterministic_collision_free(services in arb_mixed_services()) {
            let names = resolve_service_names(&services).expect("total on valid input");
            let again = resolve_service_names(&services).expect("total on valid input");
            prop_assert_eq!(&names, &again, "must be deterministic");
            prop_assert_eq!(names.len(), services.len());
            let uniq: std::collections::HashSet<_> = names.iter().collect();
            prop_assert_eq!(uniq.len(), names.len(), "output must be collision-free");
            for (s, resolved) in services.iter().zip(&names) {
                if let Some(explicit) = &s.name {
                    prop_assert_eq!(explicit, resolved, "explicit names preserved verbatim");
                }
                prop_assert!(is_valid_service_name(resolved), "resolved {} invalid", resolved);
            }
        }

        /// The CLI form round-trips for both the 2- and 3-segment shapes.
        #[test]
        fn parse_round_trips_two_and_three_segment_forms(
            s in arb_service(),
            named in arb_named_service(),
        ) {
            let two = format!("{}:{}", s.service_type.tag(), s.language);
            prop_assert_eq!(ServiceSelection::parse(&two).expect("2-segment"), s);
            let name = named.name.clone().expect("named by construction");
            let three = format!("{}:{}:{}", named.service_type.tag(), named.language, name);
            prop_assert_eq!(ServiceSelection::parse(&three).expect("3-segment"), named);
        }

        /// Invalid third segments are always rejected.
        #[test]
        fn parse_rejects_invalid_names(bad in "[A-Z_][A-Za-z0-9_]{0,10}") {
            let entry = format!("api:python:{bad}");
            prop_assert!(ServiceSelection::parse(&entry).is_err(), "accepted {:?}", entry);
        }

        /// Repo names are unique and every one satisfies the project-name pattern.
        #[test]
        fn repo_names_unique_and_valid(services in proptest::collection::vec(arb_service(), 1..10)) {
            let names = service_repo_names("demo-svc", &services).expect("no names is valid");
            let uniq: std::collections::HashSet<_> = names.iter().collect();
            prop_assert_eq!(uniq.len(), names.len(), "names must be unique");
            for n in &names {
                prop_assert!(crate::is_valid_project_name(n), "invalid repo name {}", n);
            }
        }

        /// Dirs are unique, stable under re-derivation, and aligned index-for-index with names.
        #[test]
        fn dirs_unique_stable_and_aligned(services in arb_mixed_services()) {
            let dirs = service_dirs(&services).expect("valid input");
            let again = service_dirs(&services).expect("valid input");
            prop_assert_eq!(&dirs, &again, "derivation must be deterministic");
            let uniq: std::collections::HashSet<_> = dirs.iter().collect();
            prop_assert_eq!(uniq.len(), dirs.len(), "dirs must be unique");
            let names = service_repo_names("p", &services).expect("valid input");
            for (d, n) in dirs.iter().zip(&names) {
                prop_assert_eq!(&format!("p-{d}"), n, "dir/name rule must agree");
            }
        }

        /// The manifest round-trips through its own JSON and covers every selection exactly once.
        #[test]
        fn manifest_round_trips(services in arb_mixed_services()) {
            let m = ServicesManifest::new("demo", &services).expect("valid input");
            prop_assert_eq!(m.services.len(), services.len());
            let json = m.to_json().unwrap();
            let back: ServicesManifest = serde_json::from_slice(&json).unwrap();
            prop_assert_eq!(back, m);
        }
    }
}
