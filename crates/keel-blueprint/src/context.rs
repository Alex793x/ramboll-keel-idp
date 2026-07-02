//! Build the MiniJinja rendering context from an [`InitRequest`].
//!
//! This is what the Python template consumes. In particular:
//! - `CODEOWNERS` uses `department.team_slug` and every `users[].github_login`;
//! - source files use `project_name`, `package_name`, `description`, `author`, `year`;
//! - `service_kind` is the template token (e.g. `"rest-api"`).

use keel_core::InitRequest;
use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::to_package_name;

/// Per-service template context (SPEC §12): injected as `service` when rendering one service's
/// blueprint and as an element of the `services` array when rendering the monolith root.
///
/// Field names are the template contract: `{{ service.tag }}`, `{{ service.dir }}`,
/// `{{ service.lang }}`, `{{ service.label }}`, `{{ service.repo_name }}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServiceCtx {
    /// Service-type tag (`fe|api|wk|dp|inf`).
    pub tag: String,
    /// Monolith `services/` directory (`{tag}` or `{tag}-{n}` per the ordinal rule).
    pub dir: String,
    /// Language slug (e.g. `python`, `react`).
    pub lang: String,
    /// Human label (e.g. `Backend API`).
    pub label: String,
    /// Multi-repo repository name (`{slug}-{tag}` or `{slug}-{tag}-{n}`).
    pub repo_name: String,
}

/// Build the MiniJinja context: form inputs + derived `package_name`, `year`,
/// `branch_conventions`, `department`, `users`.
#[must_use]
pub fn derive_context(req: &InitRequest) -> Map<String, Value> {
    let mut ctx = Map::new();

    ctx.insert("project_name".into(), json!(req.project_name));
    ctx.insert("blueprint".into(), json!(req.blueprint));
    ctx.insert("description".into(), json!(req.description));
    ctx.insert("author".into(), json!(req.author));
    ctx.insert("service_kind".into(), json!(req.service_kind.as_token()));
    ctx.insert(
        "package_name".into(),
        json!(to_package_name(&req.project_name)),
    );
    ctx.insert("year".into(), json!(current_year()));

    // The owning team slug is also surfaced top-level so legacy templates referencing
    // `owning_team` (the manifest parameter name) keep rendering.
    ctx.insert("owning_team".into(), json!(req.department.team_slug));

    ctx.insert(
        "branch_conventions".into(),
        json!({ "feature": "feature/", "bug": "bug/", "hotfix": "hotfix/" }),
    );

    ctx.insert(
        "department".into(),
        json!({
            "id": req.department.id,
            "name": req.department.name,
            "team_slug": req.department.team_slug,
        }),
    );

    let users: Vec<Value> = req
        .users
        .iter()
        .map(|u| {
            json!({
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "github_login": u.github_login,
            })
        })
        .collect();
    ctx.insert("users".into(), Value::Array(users));

    ctx
}

/// Build the v3 MiniJinja context (SPEC §12): everything [`derive_context`] injects **plus**
/// - `layout` — the request's [`keel_core::RepoLayout`] token (`"multi-repo"` / `"monolith"`);
/// - `service` — the [`ServiceCtx`] object, when rendering one service's blueprint;
/// - `services` — the full [`ServiceCtx`] array, when non-empty (the monolith-root render).
///
/// With `service = None` and `services = &[]` the result is exactly the v2 context plus the
/// `layout` key (property-tested below), so v2 templates keep rendering unchanged.
#[must_use]
pub fn derive_context_v3(
    req: &InitRequest,
    service: Option<&ServiceCtx>,
    services: &[ServiceCtx],
) -> Map<String, Value> {
    let mut ctx = derive_context(req);
    ctx.insert("layout".into(), json!(req.layout.as_token()));
    if let Some(svc) = service {
        ctx.insert("service".into(), json!(svc));
    }
    if !services.is_empty() {
        ctx.insert("services".into(), json!(services));
    }
    ctx
}

/// Current calendar year, computed from the system clock. Falls back to `2026` if the clock is
/// before the Unix epoch (which would only happen on a badly misconfigured host).
fn current_year() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    let secs = match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_secs() as i64,
        Err(_) => return 2026,
    };
    // Days since 1970-01-01. Civil-from-days algorithm (Howard Hinnant), year part only.
    let days = secs / 86_400;
    civil_year_from_days(days)
}

/// Year component of the proleptic-Gregorian date `days` after 1970-01-01.
fn civil_year_from_days(days: i64) -> i64 {
    // Shift epoch to 0000-03-01 so leap-day handling is trivial.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
                                  // Months are March-based here; Jan/Feb belong to the next civil year.
    if mp >= 10 {
        y + 1
    } else {
        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use keel_core::{Department, ServiceKind, User};

    fn request() -> InitRequest {
        InitRequest {
            project_name: "invoicing-api".into(),
            blueprint: "python-service".into(),
            department: Department {
                id: "d-buildings".into(),
                name: "Buildings".into(),
                team_slug: "buildings".into(),
            },
            users: vec![
                User {
                    id: "u1".into(),
                    name: "Ada".into(),
                    email: "ada@ramboll.com".into(),
                    github_login: "ada-gh".into(),
                },
                User {
                    id: "u2".into(),
                    name: "Linus".into(),
                    email: "linus@ramboll.com".into(),
                    github_login: "linus-gh".into(),
                },
            ],
            service_kind: ServiceKind::RestApi,
            description: "Handles invoices.".into(),
            author: "Ada Lovelace".into(),
            layout: keel_core::RepoLayout::default(),
            services: vec![],
        }
    }

    #[test]
    fn context_has_expected_keys_and_values() {
        let ctx = derive_context(&request());
        assert_eq!(ctx["project_name"], json!("invoicing-api"));
        assert_eq!(ctx["package_name"], json!("invoicing_api"));
        assert_eq!(ctx["service_kind"], json!("rest-api"));
        assert_eq!(ctx["description"], json!("Handles invoices."));
        assert_eq!(ctx["author"], json!("Ada Lovelace"));
        assert_eq!(ctx["department"]["team_slug"], json!("buildings"));
        assert_eq!(ctx["branch_conventions"]["feature"], json!("feature/"));
        assert_eq!(ctx["branch_conventions"]["bug"], json!("bug/"));
        assert_eq!(ctx["branch_conventions"]["hotfix"], json!("hotfix/"));
        let users = ctx["users"].as_array().unwrap();
        assert_eq!(users.len(), 2);
        assert_eq!(users[0]["github_login"], json!("ada-gh"));
        assert_eq!(users[1]["github_login"], json!("linus-gh"));
    }

    fn service_ctx(tag: &str, dir: &str, lang: &str, label: &str, repo: &str) -> ServiceCtx {
        ServiceCtx {
            tag: tag.into(),
            dir: dir.into(),
            lang: lang.into(),
            label: label.into(),
            repo_name: repo.into(),
        }
    }

    #[test]
    fn v3_context_injects_layout_service_and_services() {
        let mut req = request();
        req.layout = keel_core::RepoLayout::Monolith;
        let api = service_ctx("api", "api", "python", "Backend API", "invoicing-api-api");
        let fe = service_ctx("fe", "fe", "react", "Frontend", "invoicing-api-fe");
        let all = vec![api.clone(), fe.clone()];

        let ctx = derive_context_v3(&req, Some(&api), &all);
        assert_eq!(ctx["layout"], json!("monolith"));
        assert_eq!(ctx["service"]["tag"], json!("api"));
        assert_eq!(ctx["service"]["dir"], json!("api"));
        assert_eq!(ctx["service"]["lang"], json!("python"));
        assert_eq!(ctx["service"]["label"], json!("Backend API"));
        assert_eq!(ctx["service"]["repo_name"], json!("invoicing-api-api"));
        let services = ctx["services"].as_array().unwrap();
        assert_eq!(services.len(), 2);
        assert_eq!(services[0]["tag"], json!("api"));
        assert_eq!(services[1]["repo_name"], json!("invoicing-api-fe"));
        // v2 keys are all still present.
        assert_eq!(ctx["project_name"], json!("invoicing-api"));
        assert_eq!(ctx["package_name"], json!("invoicing_api"));
    }

    #[test]
    fn v3_context_omits_service_and_services_when_absent() {
        let ctx = derive_context_v3(&request(), None, &[]);
        assert_eq!(ctx["layout"], json!("multi-repo"));
        assert!(!ctx.contains_key("service"));
        assert!(!ctx.contains_key("services"));
    }

    proptest::proptest! {
        /// v3 with no service and no services array is exactly the v2 context + the `layout` key.
        #[test]
        fn v3_without_service_is_v2_plus_layout(
            name in "[a-z][a-z0-9-]{2,20}",
            description in "[ -~]{1,40}",
            author in "[A-Za-z ]{1,20}",
            monolith in proptest::bool::ANY,
        ) {
            let mut req = request();
            req.project_name = name;
            req.description = description;
            req.author = author;
            req.layout = if monolith {
                keel_core::RepoLayout::Monolith
            } else {
                keel_core::RepoLayout::MultiRepo
            };

            let v2 = derive_context(&req);
            let mut v3 = derive_context_v3(&req, None, &[]);

            let layout = v3.remove("layout");
            proptest::prop_assert_eq!(
                layout,
                Some(json!(req.layout.as_token())),
                "v3 must inject exactly the request's layout token"
            );
            proptest::prop_assert_eq!(v3, v2, "v3 minus `layout` must equal the v2 context");
        }
    }

    #[test]
    fn year_is_plausible() {
        let y = current_year();
        assert!((2024..=2100).contains(&y), "year out of range: {y}");
    }

    #[test]
    fn civil_year_known_dates() {
        // 1970-01-01 is day 0.
        assert_eq!(civil_year_from_days(0), 1970);
        // 2000-01-01 is 10957 days after the epoch.
        assert_eq!(civil_year_from_days(10_957), 2000);
        // 2026-06-29 is 20633 days after the epoch.
        assert_eq!(civil_year_from_days(20_633), 2026);
    }
}
