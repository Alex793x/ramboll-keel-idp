//! `GET /api/projects/:id/overview` — the v4 project-dashboard endpoint (SPEC §18).
//!
//! Everything for the endpoint lives in this module: the §18.1 wire DTOs, the six seeded design
//! rows (byte-equal to the `PROJECTS` table in `hub/src/lib/hub-data.ts`), the deterministic
//! §18.2 generator, the axum handler, and the tests pinning every generator invariant.
//!
//! ## Determinism model
//! [`overview`] is a pure function of `(id, catalog_row, people, now_s)`. FNV-1a over the project
//! id seeds a tiny xorshift64* PRNG (implemented here — no `rand` dependency), and every temporal
//! value is drawn as a **stable offset** that is only then subtracted from `now_s`. Consequences:
//! - the same `(id, now_s)` produces a byte-identical document;
//! - across different `now_s` values the *structure* (branch names, counts, crew, statuses) is
//!   identical — only the timestamps slide, so the page always feels alive.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use serde_json::json;

use keel_core::{InitOutcome, Person, RepoCoordinates, ServiceType};

use crate::state::AppState;

// ─────────────────────────────────────────────────────────────────────────────
// §18.1 wire DTOs
// ─────────────────────────────────────────────────────────────────────────────

/// The full `GET /api/projects/:id/overview` document (SPEC §18.1).
#[derive(Debug, Clone, Serialize)]
pub struct ProjectOverviewDto {
    pub project: ProjectInfoDto,
    pub team: Vec<TeamMemberDto>,
    pub branches: Vec<BranchDto>,
    pub runs: Vec<RunDto>,
    /// Flat cross-branch commit feed, ≤20, newest first.
    pub commits: Vec<FeedCommitDto>,
}

/// The `project` block: identity, layout, services, provenance, repos.
#[derive(Debug, Clone, Serialize)]
pub struct ProjectInfoDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub gba: String,
    /// `Healthy` | `Warning` | `Critical` | `Experimental`.
    pub status: String,
    /// `"multi-repo"` | `"monolith"`.
    pub layout: String,
    pub services: Vec<ServiceDto>,
    pub initialized_by: Option<PersonDto>,
    pub initialized_at: Option<i64>,
    pub blueprint: String,
    pub blueprint_version: String,
    pub repos: Vec<RepoDto>,
}

/// One service component of the project.
#[derive(Debug, Clone, Serialize)]
pub struct ServiceDto {
    /// Directory / repo suffix (e.g. `"api"`, `"api-2"`).
    pub dir: String,
    #[serde(rename = "type")]
    pub service_type: String,
    pub lang: String,
    /// Human label (e.g. `"Backend API"`).
    pub name: String,
}

/// A person reference (the §18.1 `{ id, name, github_login, chapter }` shape — no email).
#[derive(Debug, Clone, Serialize)]
pub struct PersonDto {
    pub id: String,
    pub name: String,
    pub github_login: String,
    pub chapter: String,
}

/// One repository of the project.
#[derive(Debug, Clone, Serialize)]
pub struct RepoDto {
    pub name: String,
    pub html_url: String,
    pub default_branch: String,
}

/// One crew member.
#[derive(Debug, Clone, Serialize)]
pub struct TeamMemberDto {
    pub user: PersonDto,
    /// `"owner"` | `"contributor"` — owners come first.
    pub role: String,
    /// A real working-branch name from this overview, or `null`.
    pub active_branch: Option<String>,
    pub last_active: i64,
}

/// One branch lane of "the Flow".
#[derive(Debug, Clone, Serialize)]
pub struct BranchDto {
    pub name: String,
    /// `main` | `staging` | `dev` (rails) or `feature` | `bug` | `hotfix` (working).
    pub kind: String,
    pub ahead: u32,
    pub behind: u32,
    /// Rails carry no author.
    pub author: Option<AuthorDto>,
    pub tip: TipDto,
    /// `running` | `passed` | `failed` | `none` — the status of this branch's latest run.
    pub ci: String,
    pub pr: Option<PrDto>,
    /// ≤5, newest first. `commits[0]` is the tip.
    pub commits: Vec<BranchCommitDto>,
}

/// A commit author reference.
#[derive(Debug, Clone, Serialize)]
pub struct AuthorDto {
    pub name: String,
    pub github_login: String,
}

/// A branch tip commit.
#[derive(Debug, Clone, Serialize)]
pub struct TipDto {
    pub sha: String,
    pub message: String,
    pub at: i64,
}

/// An open pull request on a working branch.
#[derive(Debug, Clone, Serialize)]
pub struct PrDto {
    pub number: u32,
    pub title: String,
    /// Always `"dev"` — working branches merge back into the dev rail.
    pub target: String,
    pub reviews_done: u8,
    pub reviews_required: u8,
}

/// One commit inside a branch's `commits` list.
#[derive(Debug, Clone, Serialize)]
pub struct BranchCommitDto {
    pub sha: String,
    pub message: String,
    pub author_login: String,
    pub at: i64,
}

/// One CI run.
#[derive(Debug, Clone, Serialize)]
pub struct RunDto {
    pub id: String,
    /// `build` | `test` | `validate` (+ `gate` on monolith projects only).
    pub workflow: String,
    pub branch: String,
    /// `running` | `queued` | `passed` | `failed`.
    pub status: String,
    pub started_at: i64,
    /// `None` ⇔ `status ∈ {running, queued}`; otherwise 30..=600 seconds.
    pub duration_s: Option<i64>,
    pub triggered_by: String,
    /// The tip sha of `branch`.
    pub trigger_sha: String,
}

/// One entry of the flat cross-branch commit feed.
#[derive(Debug, Clone, Serialize)]
pub struct FeedCommitDto {
    pub sha: String,
    pub message: String,
    pub author: AuthorDto,
    pub branch: String,
    pub at: i64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded design rows (byte-equal to hub/src/lib/hub-data.ts PROJECTS)
// ─────────────────────────────────────────────────────────────────────────────

/// One of the six design catalog rows. `id`/`name`/`desc`/`gba`/`status` are byte-equal to
/// `hub/src/lib/hub-data.ts`; `services` is the design's service count, used to size the
/// generated service list.
struct SeedRow {
    id: &'static str,
    name: &'static str,
    desc: &'static str,
    gba: &'static str,
    status: &'static str,
    services: usize,
}

/// The six seeded design projects (hub-data.ts source lines 636–641 — do not rephrase).
const SEEDED: [SeedRow; 6] = [
    SeedRow {
        id: "RMB-EN-017",
        name: "Emissions Calculator",
        desc: "Whole-life carbon estimates for infrastructure bids",
        gba: "Energy",
        status: "Healthy",
        services: 3,
    },
    SeedRow {
        id: "RMB-MC-024",
        name: "Project Insights Portal",
        desc: "Cross-project delivery metrics for programme leads",
        gba: "Management Consulting",
        status: "Warning",
        services: 4,
    },
    SeedRow {
        id: "RMB-WA-031",
        name: "Groundwater Twin",
        desc: "Digital twin for aquifer monitoring, Jutland pilot",
        gba: "Water",
        status: "Experimental",
        services: 2,
    },
    SeedRow {
        id: "RMB-TR-008",
        name: "Bridge Inspection AI",
        desc: "Drone imagery defect detection & reporting",
        gba: "Transport",
        status: "Healthy",
        services: 5,
    },
    SeedRow {
        id: "RMB-EN-042",
        name: "District Heating Optimizer",
        desc: "Forecast-driven load balancing for DK networks",
        gba: "Energy",
        status: "Healthy",
        services: 3,
    },
    SeedRow {
        id: "RMB-WA-012",
        name: "Customer Data API",
        desc: "Unified client & asset master data service",
        gba: "Water",
        status: "Healthy",
        services: 2,
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic PRNG (FNV-1a seed → xorshift64*) — no `rand` dependency
// ─────────────────────────────────────────────────────────────────────────────

/// FNV-1a over the project id — the PRNG seed.
fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// A tiny xorshift64* PRNG. Deterministic, dependency-free, plenty for mock data.
struct Rng(u64);

impl Rng {
    /// xorshift64* must never hold state 0 — remap it to a fixed odd constant.
    fn new(seed: u64) -> Self {
        Self(if seed == 0 {
            0x9E37_79B9_7F4A_7C15
        } else {
            seed
        })
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Uniform-ish value in `0..n`. `n` must be > 0 (all call sites use non-empty ranges).
    fn below(&mut self, n: u64) -> u64 {
        debug_assert!(n > 0, "Rng::below(0)");
        self.next_u64() % n
    }

    /// Inclusive range `lo..=hi` (requires `lo <= hi`).
    fn range(&mut self, lo: i64, hi: i64) -> i64 {
        lo + self.below((hi - lo + 1) as u64) as i64
    }

    /// Pick a reference from a non-empty slice.
    fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[self.below(xs.len() as u64) as usize]
    }

    /// True with probability `num/den`.
    fn chance(&mut self, num: u64, den: u64) -> bool {
        self.below(den) < num
    }

    /// A 7-hex-char pseudo commit sha.
    fn sha(&mut self) -> String {
        format!("{:07x}", self.next_u64() & 0x0FFF_FFFF)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic content pools
// ─────────────────────────────────────────────────────────────────────────────

/// Working-branch ticket slugs (picked without replacement — branch names stay unique).
const BRANCH_SLUGS: [&str; 12] = [
    "load-forecasting",
    "sensor-ingest",
    "auth-refresh",
    "report-export",
    "cache-tuning",
    "ui-polish",
    "data-migration",
    "alerting",
    "api-contract",
    "retry-logic",
    "geo-lookup",
    "docs-cleanup",
];

const FEATURE_COMMIT_TYPES: [&str; 4] = ["feat", "refactor", "test", "chore"];
const FIX_COMMIT_TYPES: [&str; 3] = ["fix", "test", "chore"];
const COMMIT_VERBS: [&str; 6] = ["add", "wire", "extend", "refine", "harden", "simplify"];
const COMMIT_OBJECTS: [&str; 8] = [
    "input validation",
    "retry backoff",
    "error mapping",
    "config loading",
    "cache invalidation",
    "request tracing",
    "pagination",
    "schema checks",
];

/// The 7 design GBAs (fixtures/mock-data.json departments) — used for catalog rows, which do
/// not persist a GBA.
const GBAS: [&str; 7] = [
    "Energy",
    "Water",
    "Transport",
    "Buildings",
    "Environment & Health",
    "Management Consulting",
    "Architecture & Landscape",
];

/// Descriptions for catalog rows (the engine catalog does not persist one).
const CATALOG_DESCRIPTIONS: [&str; 6] = [
    "Engineering delivery service initialized through Keel",
    "Internal platform service for cross-team data workflows",
    "Domain service scaffolded from the Keel golden path",
    "Project tooling service for programme delivery",
    "Data-backed service supporting field operations",
    "Shared capability service for client-facing teams",
];

// ─────────────────────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────────────────────

/// Deterministic §18.2 overview generator — a pure function of its arguments.
///
/// Resolution order: one of the six seeded design projects (matched by id) wins; otherwise the
/// supplied `catalog_row` (a real project — the handler matches it by `InitOutcome::project` or
/// `catalog_id`); otherwise `None` (the handler maps that to 404).
///
/// Catalog rows contribute their real facts — `repos` (name/html_url/default_branch),
/// `blueprint_version`, and the project name; layout and services are inferred from the repo
/// names where possible. `initialized_by` for catalog rows is honestly **best-effort**: the
/// engine catalog does not persist who ran the initialization, so a person is picked
/// deterministically from `people` instead.
///
/// Returns `None` when `people` is empty: every author and `triggered_by` must be drawn from
/// `people`, so an empty directory cannot be attributed. The handler never hits this — the
/// embedded catalog ships 11 people.
#[must_use]
pub fn overview(
    id: &str,
    catalog_row: Option<&InitOutcome>,
    people: &[Person],
    now_s: i64,
) -> Option<ProjectOverviewDto> {
    if people.is_empty() {
        return None;
    }
    let seed_row = SEEDED.iter().find(|s| s.id == id);
    let mut rng = Rng::new(fnv1a(id));

    let (project, monolith) = match (seed_row, catalog_row) {
        (Some(seed), _) => seeded_project(id, seed, people, &mut rng, now_s),
        (None, Some(row)) => catalog_project(id, row, people, &mut rng, now_s),
        (None, None) => return None,
    };

    let members = pick_members(people, &mut rng);
    let ticket = ticket_for(id, &mut rng);
    let working = gen_working_branches(&mut rng, &ticket, &members, now_s);
    let mut branches = gen_rails(&mut rng, &members, &working, now_s);
    branches.extend(working);

    let mut runs = gen_runs(&mut rng, &branches, &members, monolith, now_s);
    if seed_row.is_some() {
        force_one_running(&mut runs);
    }
    apply_ci(&mut branches, &mut runs, &mut rng);

    let team = gen_team(&mut rng, &members, &branches, now_s);
    let commits = flat_feed(&branches, people);

    Some(ProjectOverviewDto {
        project,
        team,
        branches,
        runs,
        commits,
    })
}

/// Project block for one of the six seeded design rows: identity byte-equal to hub-data.ts,
/// layout/services/repos generated deterministically.
fn seeded_project(
    id: &str,
    seed: &SeedRow,
    people: &[Person],
    rng: &mut Rng,
    now_s: i64,
) -> (ProjectInfoDto, bool) {
    let monolith = rng.chance(1, 3);
    let services = gen_services(rng, seed.services);
    let slug = slugify(seed.name);
    let repos: Vec<RepoDto> = if monolith {
        vec![repo_dto(&slug)]
    } else {
        services
            .iter()
            .map(|s| repo_dto(&format!("{slug}-{}", s.dir)))
            .collect()
    };
    let blueprint = blueprint_for(monolith, &services);
    let blueprint_version = format!("0.{}.{}", rng.range(1, 4), rng.range(0, 9));
    let info = ProjectInfoDto {
        id: id.to_owned(),
        name: seed.name.to_owned(),
        description: seed.desc.to_owned(),
        gba: seed.gba.to_owned(),
        status: seed.status.to_owned(),
        layout: layout_str(monolith).to_owned(),
        services,
        initialized_by: Some(person_dto(rng.pick(people))),
        initialized_at: Some(now_s - rng.range(30 * 86_400, 180 * 86_400)),
        blueprint,
        blueprint_version,
        repos,
    };
    (info, monolith)
}

/// Project block for a real catalog row: real `repos`/`blueprint_version`/name; status
/// `Healthy`; gba/description generated deterministically. Layout + services are inferred from
/// the repo names (`{slug}-{tag}` ⇒ multi-repo service; no parseable tag ⇒ monolith) —
/// best-effort, since the catalog does not persist the original selection.
fn catalog_project(
    id: &str,
    row: &InitOutcome,
    people: &[Person],
    rng: &mut Rng,
    now_s: i64,
) -> (ProjectInfoDto, bool) {
    let source_repos: Vec<&RepoCoordinates> = if row.repos.is_empty() {
        vec![&row.repo]
    } else {
        row.repos.iter().collect()
    };
    let slug = slugify(&row.project);
    let parsed: Vec<ServiceDto> = source_repos
        .iter()
        .filter_map(|r| service_from_repo_name(&slug, &r.name, rng))
        .collect();
    let monolith = parsed.is_empty();
    let services = if monolith {
        let n = rng.range(1, 3) as usize;
        gen_services(rng, n)
    } else {
        parsed
    };
    let blueprint = blueprint_for(monolith, &services);
    let info = ProjectInfoDto {
        id: id.to_owned(),
        name: row.project.clone(),
        description: (*rng.pick(&CATALOG_DESCRIPTIONS)).to_owned(),
        gba: (*rng.pick(&GBAS)).to_owned(),
        status: "Healthy".to_owned(),
        layout: layout_str(monolith).to_owned(),
        services,
        // Best-effort: the catalog does not persist the author (see fn docs).
        initialized_by: Some(person_dto(rng.pick(people))),
        initialized_at: Some(now_s - rng.range(30 * 86_400, 180 * 86_400)),
        blueprint,
        blueprint_version: row.blueprint_version.clone(),
        repos: source_repos
            .iter()
            .map(|r| RepoDto {
                name: r.name.clone(),
                html_url: r.html_url.clone(),
                default_branch: r.default_branch.clone(),
            })
            .collect(),
    };
    (info, monolith)
}

/// `n` plausible services in a fixed type order, languages picked deterministically.
fn gen_services(rng: &mut Rng, n: usize) -> Vec<ServiceDto> {
    const ORDER: [ServiceType; 5] = [
        ServiceType::Api,
        ServiceType::Fe,
        ServiceType::Wk,
        ServiceType::Dp,
        ServiceType::Inf,
    ];
    ORDER
        .iter()
        .take(n.clamp(1, 5))
        .map(|t| ServiceDto {
            dir: t.tag().to_owned(),
            service_type: t.tag().to_owned(),
            lang: (*rng.pick(langs_for(*t))).to_owned(),
            name: t.label().to_owned(),
        })
        .collect()
}

/// Parse a `{slug}-{tag}[-{n}]` repo name into a service (multi-repo naming, SPEC §13).
fn service_from_repo_name(slug: &str, repo_name: &str, rng: &mut Rng) -> Option<ServiceDto> {
    let rest = repo_name.strip_prefix(&format!("{slug}-"))?;
    let tag = rest.split('-').next()?;
    let t: ServiceType = tag.parse().ok()?;
    Some(ServiceDto {
        dir: rest.to_owned(),
        service_type: t.tag().to_owned(),
        lang: (*rng.pick(langs_for(t))).to_owned(),
        name: t.label().to_owned(),
    })
}

/// Plausible language slugs per service type (mirrors the wizard's design order).
fn langs_for(t: ServiceType) -> &'static [&'static str] {
    match t {
        ServiceType::Fe => &["react", "vue", "blazor"],
        ServiceType::Api => &["dotnet", "python", "node"],
        ServiceType::Wk => &["dotnet", "python", "go"],
        ServiceType::Dp => &["python", "dbt", "spark"],
        ServiceType::Inf => &["terraform", "bicep"],
    }
}

fn layout_str(monolith: bool) -> &'static str {
    if monolith {
        "monolith"
    } else {
        "multi-repo"
    }
}

/// The blueprint the project was laid down from: the first service's building block for
/// multi-repo, the monolith root otherwise.
fn blueprint_for(monolith: bool, services: &[ServiceDto]) -> String {
    if monolith {
        return "monolith-root".to_owned();
    }
    services.first().map_or_else(
        || "monolith-root".to_owned(),
        |s| format!("{}-{}", s.service_type, s.lang),
    )
}

fn repo_dto(name: &str) -> RepoDto {
    RepoDto {
        name: name.to_owned(),
        html_url: format!("https://github.com/ramboll/{name}"),
        default_branch: "main".to_owned(),
    }
}

fn person_dto(p: &Person) -> PersonDto {
    PersonDto {
        id: p.id.clone(),
        name: p.name.clone(),
        github_login: p.github_login.clone(),
        chapter: p.chapter.clone(),
    }
}

/// Lowercased `[a-z0-9-]` slug of a display name; never empty (falls back to `"project"`).
fn slugify(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for c in name.chars() {
        let c = c.to_ascii_lowercase();
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-').to_owned();
    if out.is_empty() {
        "project".to_owned()
    } else {
        out
    }
}

/// Ticket stem for branch names: `rmb-<project id digits>` (e.g. `RMB-EN-017` → `rmb-017`), or a
/// stable pseudo number when the id carries no digits.
fn ticket_for(id: &str, rng: &mut Rng) -> String {
    let digits: String = id.chars().filter(char::is_ascii_digit).take(6).collect();
    if digits.is_empty() {
        format!("rmb-{}", rng.range(100, 999))
    } else {
        format!("rmb-{digits}")
    }
}

/// 3..=6 distinct people (partial Fisher–Yates over the whole directory).
fn pick_members<'a>(people: &'a [Person], rng: &mut Rng) -> Vec<&'a Person> {
    let k = (rng.range(3, 6) as usize).min(people.len());
    let mut idx: Vec<usize> = (0..people.len()).collect();
    for i in 0..k {
        let j = i + rng.below((idx.len() - i) as u64) as usize;
        idx.swap(i, j);
    }
    idx[..k].iter().map(|&i| &people[i]).collect()
}

/// 1..=5 working branches: kind-weighted (mostly feature), ticket-style names, unique slugs,
/// ≤5 conventional-commit-style commits each (newest first), a PR on roughly half.
fn gen_working_branches(
    rng: &mut Rng,
    ticket: &str,
    members: &[&Person],
    now_s: i64,
) -> Vec<BranchDto> {
    let count = rng.range(1, 5) as usize;
    let mut slugs: Vec<&str> = BRANCH_SLUGS.to_vec();
    (0..count)
        .map(|_| {
            let kind = match rng.below(10) {
                0..=6 => "feature",
                7 | 8 => "bug",
                _ => "hotfix",
            };
            let slug = slugs.remove(rng.below(slugs.len() as u64) as usize);
            let name = format!("{kind}/{ticket}-{slug}");
            let author = *rng.pick(members);
            let ahead = rng.range(1, 8) as u32;
            let behind = rng.range(0, 3) as u32;
            let commits = gen_branch_commits(rng, kind, &author.github_login, now_s);
            let pr = rng.chance(1, 2).then(|| gen_pr(rng, ticket, slug));
            BranchDto {
                name,
                kind: kind.to_owned(),
                ahead,
                behind,
                author: Some(AuthorDto {
                    name: author.name.clone(),
                    github_login: author.github_login.clone(),
                }),
                tip: tip_of(&commits),
                ci: "none".to_owned(), // set by apply_ci once runs exist
                pr,
                commits,
            }
        })
        .collect()
}

/// 1..=5 commits, tip first, strictly descending `at` (offsets only grow).
fn gen_branch_commits(
    rng: &mut Rng,
    kind: &str,
    author_login: &str,
    now_s: i64,
) -> Vec<BranchCommitDto> {
    let n = rng.range(1, 5) as usize;
    let mut off = rng.range(1800, 172_800); // tip: 30min..48h ago
    (0..n)
        .map(|_| {
            let c = BranchCommitDto {
                sha: rng.sha(),
                message: commit_message(rng, kind),
                author_login: author_login.to_owned(),
                at: now_s - off,
            };
            off += rng.range(600, 28_800);
            c
        })
        .collect()
}

/// A conventional-commit-style message composed from the small pools.
fn commit_message(rng: &mut Rng, kind: &str) -> String {
    let ctype = if kind == "feature" {
        *rng.pick(&FEATURE_COMMIT_TYPES)
    } else {
        *rng.pick(&FIX_COMMIT_TYPES)
    };
    format!(
        "{ctype}: {} {}",
        rng.pick(&COMMIT_VERBS),
        rng.pick(&COMMIT_OBJECTS)
    )
}

/// An open PR targeting the dev rail, with `reviews_done ≤ reviews_required ≤ 2`.
fn gen_pr(rng: &mut Rng, ticket: &str, slug: &str) -> PrDto {
    let reviews_required = rng.range(1, 2) as u8;
    let reviews_done = rng.range(0, i64::from(reviews_required)) as u8;
    PrDto {
        number: rng.range(100, 999) as u32,
        title: format!("{}: {}", ticket.to_uppercase(), humanize(slug)),
        target: "dev".to_owned(),
        reviews_done,
        reviews_required,
    }
}

/// `"load-forecasting"` → `"Load forecasting"`.
fn humanize(slug: &str) -> String {
    let text = slug.replace('-', " ");
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => text,
    }
}

/// The three permanent rails (main, staging, dev): ahead/behind 0, no author, no PR, 1..=3
/// promote/merge commits each.
fn gen_rails(
    rng: &mut Rng,
    members: &[&Person],
    working: &[BranchDto],
    now_s: i64,
) -> Vec<BranchDto> {
    ["main", "staging", "dev"]
        .iter()
        .map(|rail| {
            let n = rng.range(1, 3) as usize;
            let mut off = rng.range(3600, 172_800);
            let commits: Vec<BranchCommitDto> = (0..n)
                .map(|_| {
                    let author = *rng.pick(members);
                    let c = BranchCommitDto {
                        sha: rng.sha(),
                        message: rail_message(rng, rail, working),
                        author_login: author.github_login.clone(),
                        at: now_s - off,
                    };
                    off += rng.range(3600, 86_400);
                    c
                })
                .collect();
            BranchDto {
                name: (*rail).to_owned(),
                kind: (*rail).to_owned(),
                ahead: 0,
                behind: 0,
                author: None,
                tip: tip_of(&commits),
                ci: "none".to_owned(), // set by apply_ci once runs exist
                pr: None,
                commits,
            }
        })
        .collect()
}

/// Rail commit messages: dev merges working branches; staging/main are promotions.
fn rail_message(rng: &mut Rng, rail: &str, working: &[BranchDto]) -> String {
    match rail {
        "dev" => format!(
            "Merge pull request #{} from {}",
            rng.range(80, 400),
            rng.pick(working).name
        ),
        "staging" => "chore(release): promote dev to staging".to_owned(),
        _ => "chore(release): promote staging to main".to_owned(),
    }
}

/// Tip = the newest (first) commit. Branches always carry ≥1 commit; the fallback is unreachable.
fn tip_of(commits: &[BranchCommitDto]) -> TipDto {
    commits.first().map_or_else(
        || TipDto {
            sha: String::new(),
            message: String::new(),
            at: 0,
        },
        |c| TipDto {
            sha: c.sha.clone(),
            message: c.message.clone(),
            at: c.at,
        },
    )
}

/// 3..=8 runs across all branches, newest first, unique `started_at` offsets (so "latest run per
/// branch" is unambiguous), `trigger_sha` = the branch tip.
fn gen_runs(
    rng: &mut Rng,
    branches: &[BranchDto],
    members: &[&Person],
    monolith: bool,
    now_s: i64,
) -> Vec<RunDto> {
    let workflows: &[&str] = if monolith {
        &["build", "test", "validate", "gate"]
    } else {
        &["build", "test", "validate"]
    };
    let n = rng.range(3, 8) as usize;
    let mut used = std::collections::HashSet::new();
    let mut runs: Vec<RunDto> = (0..n)
        .map(|i| {
            let branch = rng.pick(branches);
            let mut off = rng.range(300, 259_200); // 5min..72h ago
            while !used.insert(off) {
                off += 1;
            }
            let status = match rng.below(8) {
                0..=3 => "passed",
                4 => "running",
                5 => "queued",
                _ => "failed",
            };
            let duration_s = matches!(status, "passed" | "failed").then(|| rng.range(30, 600));
            RunDto {
                id: format!("run-{i}-{}", rng.sha()),
                workflow: (*rng.pick(workflows)).to_owned(),
                branch: branch.name.clone(),
                status: status.to_owned(),
                started_at: now_s - off,
                duration_s,
                triggered_by: rng.pick(members).github_login.clone(),
                trigger_sha: branch.tip.sha.clone(),
            }
        })
        .collect();
    runs.sort_by_key(|r| std::cmp::Reverse(r.started_at));
    runs
}

/// Seeded projects must always feel alive: if no run is running, promote the newest one.
fn force_one_running(runs: &mut [RunDto]) {
    if runs.iter().any(|r| r.status == "running") {
        return;
    }
    if let Some(first) = runs.first_mut() {
        first.status = "running".to_owned();
        first.duration_s = None;
    }
}

/// Set every branch's `ci` to the status of its latest run (`"none"` if it has none).
///
/// A branch whose *latest* run is still `queued` would force a `queued` ci — outside the §18.1
/// ci vocabulary — so such runs are settled to `passed` first (older queued runs stay queued).
fn apply_ci(branches: &mut [BranchDto], runs: &mut [RunDto], rng: &mut Rng) {
    for b in branches.iter_mut() {
        // Runs are sorted newest-first, so the first match is the latest run.
        let Some(i) = runs.iter().position(|r| r.branch == b.name) else {
            b.ci = "none".to_owned();
            continue;
        };
        if runs[i].status == "queued" {
            runs[i].status = "passed".to_owned();
            runs[i].duration_s = Some(rng.range(30, 600));
        }
        b.ci = runs[i].status.clone();
    }
}

/// Crew: the picked members, 1..=2 owners first, ~half on a real working branch.
fn gen_team(
    rng: &mut Rng,
    members: &[&Person],
    branches: &[BranchDto],
    now_s: i64,
) -> Vec<TeamMemberDto> {
    let working: Vec<&str> = branches
        .iter()
        .filter(|b| is_working_kind(&b.kind))
        .map(|b| b.name.as_str())
        .collect();
    let owners = (rng.range(1, 2) as usize).min(members.len());
    members
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let active_branch =
                (!working.is_empty() && rng.chance(1, 2)).then(|| (*rng.pick(&working)).to_owned());
            TeamMemberDto {
                user: person_dto(p),
                role: if i < owners { "owner" } else { "contributor" }.to_owned(),
                active_branch,
                last_active: now_s - rng.range(600, 259_200),
            }
        })
        .collect()
}

fn is_working_kind(kind: &str) -> bool {
    matches!(kind, "feature" | "bug" | "hotfix")
}

/// Flat cross-branch feed: every branch commit (rails included), newest first, capped at 20.
fn flat_feed(branches: &[BranchDto], people: &[Person]) -> Vec<FeedCommitDto> {
    let mut feed: Vec<FeedCommitDto> = branches
        .iter()
        .flat_map(|b| {
            b.commits.iter().map(move |c| FeedCommitDto {
                sha: c.sha.clone(),
                message: c.message.clone(),
                author: AuthorDto {
                    name: people
                        .iter()
                        .find(|p| p.github_login == c.author_login)
                        .map_or_else(|| c.author_login.clone(), |p| p.name.clone()),
                    github_login: c.author_login.clone(),
                },
                branch: b.name.clone(),
                at: c.at,
            })
        })
        .collect();
    feed.sort_by_key(|c| std::cmp::Reverse(c.at));
    feed.truncate(20);
    feed
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/// Current unix time in seconds (saturating; the clock is never before the epoch in practice).
fn now_epoch_s() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// `GET /api/projects/:id/overview` → `200 ProjectOverviewDto` | `404 { "error": … }`.
///
/// Catalog rows are matched by `InitOutcome::project` **or** `catalog_id`; a failing catalog
/// read degrades to "no catalog rows" so the six seeded projects stay servable.
pub(crate) async fn project_overview(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let rows = state.engine.list_projects().unwrap_or_default();
    let row = rows.iter().find(|r| r.project == id || r.catalog_id == id);
    match overview(&id, row, &state.data.people, now_epoch_s()) {
        Some(dto) => Json(dto).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": format!("unknown project: {id:?}") })),
        )
            .into_response(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — §18.2 invariants, byte-equality with hub-data.ts, handler behavior
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use keel_core::MockCatalog;
    use proptest::prelude::*;
    use std::collections::{HashMap, HashSet};
    use std::path::PathBuf;
    use tower::ServiceExt; // for `oneshot`

    /// A fixed "now" (mid-2025) for the deterministic unit tests.
    const NOW: i64 = 1_751_400_000;

    fn people() -> Vec<Person> {
        MockCatalog::embedded().people
    }

    fn seeded_ids() -> Vec<&'static str> {
        SEEDED.iter().map(|s| s.id).collect()
    }

    /// A synthetic catalog row for `id` — multi-repo (`{slug}-api`) or monolith (`{slug}`).
    fn fake_row(id: &str, monolith: bool) -> InitOutcome {
        let slug = slugify(id);
        let name = if monolith {
            slug.clone()
        } else {
            format!("{slug}-api")
        };
        let repo = RepoCoordinates {
            owner: "ramboll".to_owned(),
            name: name.clone(),
            html_url: format!("https://github.com/ramboll/{name}"),
            default_branch: "main".to_owned(),
            branches: vec!["main".to_owned(), "staging".to_owned(), "dev".to_owned()],
        };
        InitOutcome {
            project: id.to_owned(),
            repo: repo.clone(),
            repos: vec![repo],
            docs_path: format!("docs/{slug}"),
            blueprint_version: "0.9.9".to_owned(),
            catalog_id: format!("cat-{slug}"),
            events: vec![],
        }
    }

    /// Manual check for `^(feature|bug|hotfix)/[a-z0-9]+(-[a-z0-9]+)*$` (no regex dep).
    fn valid_working_name(name: &str) -> bool {
        let Some((kind, rest)) = name.split_once('/') else {
            return false;
        };
        matches!(kind, "feature" | "bug" | "hotfix")
            && !rest.is_empty()
            && rest.split('-').all(|seg| {
                !seg.is_empty()
                    && seg
                        .chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
            })
    }

    /// Every §18.2 invariant, checked against one generated document.
    #[allow(clippy::too_many_lines)]
    fn assert_invariants(dto: &ProjectOverviewDto, people: &[Person], now: i64) {
        let logins: HashSet<&str> = people.iter().map(|p| p.github_login.as_str()).collect();
        let by_name: HashMap<&str, &BranchDto> =
            dto.branches.iter().map(|b| (b.name.as_str(), b)).collect();
        assert_eq!(by_name.len(), dto.branches.len(), "branch names unique");

        // Rails: exactly one each, ahead/behind 0, no author, no PR.
        for rail in ["main", "staging", "dev"] {
            let rails: Vec<&&BranchDto> = by_name.values().filter(|b| b.kind == rail).collect();
            assert_eq!(rails.len(), 1, "exactly one {rail} rail");
            let b = rails[0];
            assert_eq!(b.name, rail);
            assert_eq!((b.ahead, b.behind), (0, 0), "rails carry no ahead/behind");
            assert!(b.author.is_none() && b.pr.is_none());
        }

        // Working branches: 1..=5, regex-valid names, ahead ≥ 1, authors from people.
        let working: Vec<&BranchDto> = dto
            .branches
            .iter()
            .filter(|b| is_working_kind(&b.kind))
            .collect();
        assert!((1..=5).contains(&working.len()), "1..=5 working branches");
        assert_eq!(dto.branches.len(), 3 + working.len(), "no stray kinds");
        for b in &working {
            assert!(valid_working_name(&b.name), "bad name: {}", b.name);
            assert!(b.name.starts_with(&format!("{}/", b.kind)));
            assert!(b.ahead >= 1, "working ahead >= 1");
            let author = b.author.as_ref().expect("working branch author");
            assert!(logins.contains(author.github_login.as_str()));
            if let Some(pr) = &b.pr {
                assert_eq!(pr.target, "dev");
                assert!(pr.reviews_done <= pr.reviews_required && pr.reviews_required <= 2);
            }
        }

        // Per-branch commits: ≤5, desc, tip = commits[0], authors from people, at ≤ now.
        for b in &dto.branches {
            assert!(!b.commits.is_empty() && b.commits.len() <= 5);
            assert_eq!(b.tip.sha, b.commits[0].sha, "tip is the newest commit");
            assert!(b.tip.at <= now);
            for w in b.commits.windows(2) {
                assert!(w[0].at >= w[1].at, "branch commits desc");
            }
            for c in &b.commits {
                assert!(c.at <= now);
                assert!(logins.contains(c.author_login.as_str()));
            }
            // ci == status of the latest run for this branch, or "none".
            let latest = dto
                .runs
                .iter()
                .filter(|r| r.branch == b.name)
                .max_by_key(|r| r.started_at);
            match latest {
                Some(r) => assert_eq!(b.ci, r.status, "ci mirrors the latest run"),
                None => assert_eq!(b.ci, "none"),
            }
            assert!(matches!(
                b.ci.as_str(),
                "running" | "passed" | "failed" | "none"
            ));
        }

        // Runs: 3..=8, newest first, valid vocab, duration ⇔ status, real branches + tip shas.
        assert!((3..=8).contains(&dto.runs.len()));
        for w in dto.runs.windows(2) {
            assert!(w[0].started_at >= w[1].started_at, "runs newest first");
        }
        for r in &dto.runs {
            assert!(matches!(
                r.status.as_str(),
                "running" | "queued" | "passed" | "failed"
            ));
            assert_eq!(
                r.duration_s.is_none(),
                matches!(r.status.as_str(), "running" | "queued"),
                "duration_s None ⇔ running|queued"
            );
            if let Some(d) = r.duration_s {
                assert!((30..=600).contains(&d));
            }
            assert!(r.started_at <= now);
            assert!(logins.contains(r.triggered_by.as_str()));
            let b = by_name
                .get(r.branch.as_str())
                .expect("run on a real branch");
            assert_eq!(r.trigger_sha, b.tip.sha, "trigger_sha is the branch tip");
            assert!(matches!(
                r.workflow.as_str(),
                "build" | "test" | "validate" | "gate"
            ));
            if r.workflow == "gate" {
                assert_eq!(dto.project.layout, "monolith", "gate only on monoliths");
            }
        }

        // Flat feed: ≤20, desc, real branches, authors from people.
        assert!(!dto.commits.is_empty() && dto.commits.len() <= 20);
        for w in dto.commits.windows(2) {
            assert!(w[0].at >= w[1].at, "feed desc");
        }
        for c in &dto.commits {
            assert!(c.at <= now);
            assert!(logins.contains(c.author.github_login.as_str()));
            assert!(by_name.contains_key(c.branch.as_str()));
        }

        // Team: owners first, everyone from people, active_branch is a real working branch.
        assert!((3..=6).contains(&dto.team.len()));
        let owners = dto.team.iter().take_while(|m| m.role == "owner").count();
        assert!((1..=2).contains(&owners));
        assert!(dto
            .team
            .iter()
            .skip(owners)
            .all(|m| m.role == "contributor"));
        for m in &dto.team {
            assert!(logins.contains(m.user.github_login.as_str()));
            assert!(m.last_active <= now);
            if let Some(ab) = &m.active_branch {
                assert!(
                    working.iter().any(|b| &b.name == ab),
                    "active_branch must be a real working branch"
                );
            }
        }

        // Project block sanity.
        assert!(matches!(
            dto.project.status.as_str(),
            "Healthy" | "Warning" | "Critical" | "Experimental"
        ));
        assert!(matches!(
            dto.project.layout.as_str(),
            "multi-repo" | "monolith"
        ));
        assert!(!dto.project.services.is_empty() && !dto.project.repos.is_empty());
        if let Some(at) = dto.project.initialized_at {
            assert!(at <= now);
        }
        if let Some(p) = &dto.project.initialized_by {
            assert!(logins.contains(p.github_login.as_str()));
        }
    }

    fn to_json(dto: &ProjectOverviewDto) -> String {
        serde_json::to_string(dto).expect("serializable dto")
    }

    // ── determinism + structural stability ───────────────────────────────────

    #[test]
    fn same_inputs_yield_identical_json() {
        let people = people();
        for id in seeded_ids() {
            let a = overview(id, None, &people, NOW).expect("seeded id");
            let b = overview(id, None, &people, NOW).expect("seeded id");
            assert_eq!(to_json(&a), to_json(&b), "{id} must be deterministic");
        }
        let row = fake_row("wind-farm-analytics", false);
        let a = overview("wind-farm-analytics", Some(&row), &people, NOW).expect("catalog row");
        let b = overview("wind-farm-analytics", Some(&row), &people, NOW).expect("catalog row");
        assert_eq!(to_json(&a), to_json(&b));
    }

    #[test]
    fn structure_is_stable_across_now() {
        let people = people();
        for id in seeded_ids() {
            let a = overview(id, None, &people, NOW).expect("seeded id");
            let b = overview(id, None, &people, NOW + 999_983).expect("seeded id");
            let names = |d: &ProjectOverviewDto| -> Vec<String> {
                d.branches.iter().map(|x| x.name.clone()).collect()
            };
            assert_eq!(names(&a), names(&b), "{id}: branch names stable");
            let team = |d: &ProjectOverviewDto| -> Vec<(String, String, Option<String>)> {
                d.team
                    .iter()
                    .map(|m| {
                        (
                            m.user.github_login.clone(),
                            m.role.clone(),
                            m.active_branch.clone(),
                        )
                    })
                    .collect()
            };
            assert_eq!(team(&a), team(&b), "{id}: team stable");
            let runs = |d: &ProjectOverviewDto| -> Vec<(String, String, String)> {
                d.runs
                    .iter()
                    .map(|r| (r.workflow.clone(), r.branch.clone(), r.status.clone()))
                    .collect()
            };
            assert_eq!(runs(&a), runs(&b), "{id}: runs stable");
            assert_eq!(a.commits.len(), b.commits.len(), "{id}: feed size stable");
        }
    }

    // ── seeded rows + unknown ids ────────────────────────────────────────────

    #[test]
    fn seeded_rows_match_hub_data_byte_for_byte() {
        // Literals intentionally duplicated from hub/src/lib/hub-data.ts PROJECTS — this test
        // is the tripwire if either side drifts.
        let expected = [
            (
                "RMB-EN-017",
                "Emissions Calculator",
                "Whole-life carbon estimates for infrastructure bids",
                "Energy",
                "Healthy",
            ),
            (
                "RMB-MC-024",
                "Project Insights Portal",
                "Cross-project delivery metrics for programme leads",
                "Management Consulting",
                "Warning",
            ),
            (
                "RMB-WA-031",
                "Groundwater Twin",
                "Digital twin for aquifer monitoring, Jutland pilot",
                "Water",
                "Experimental",
            ),
            (
                "RMB-TR-008",
                "Bridge Inspection AI",
                "Drone imagery defect detection & reporting",
                "Transport",
                "Healthy",
            ),
            (
                "RMB-EN-042",
                "District Heating Optimizer",
                "Forecast-driven load balancing for DK networks",
                "Energy",
                "Healthy",
            ),
            (
                "RMB-WA-012",
                "Customer Data API",
                "Unified client & asset master data service",
                "Water",
                "Healthy",
            ),
        ];
        let people = people();
        for (id, name, desc, gba, status) in expected {
            let dto = overview(id, None, &people, NOW).expect("seeded id must resolve");
            assert_eq!(dto.project.id, id);
            assert_eq!(dto.project.name, name);
            assert_eq!(dto.project.description, desc);
            assert_eq!(dto.project.gba, gba);
            assert_eq!(dto.project.status, status);
        }
        assert!(overview("nope", None, &people, NOW).is_none());
        assert!(overview("", None, &people, NOW).is_none());
    }

    #[test]
    fn seeded_documents_satisfy_all_invariants() {
        let people = people();
        for id in seeded_ids() {
            let dto = overview(id, None, &people, NOW).expect("seeded id");
            assert_invariants(&dto, &people, NOW);
        }
    }

    #[test]
    fn every_seeded_project_has_a_running_run() {
        let people = people();
        for id in seeded_ids() {
            let dto = overview(id, None, &people, NOW).expect("seeded id");
            assert!(
                dto.runs.iter().any(|r| r.status == "running"),
                "{id} must feel alive"
            );
        }
    }

    // ── real catalog rows ────────────────────────────────────────────────────

    #[test]
    fn catalog_row_supplies_real_facts() {
        let people = people();
        let row = fake_row("wind-farm-analytics", false);
        let dto = overview("wind-farm-analytics", Some(&row), &people, NOW).expect("catalog row");
        assert_eq!(dto.project.name, "wind-farm-analytics");
        assert_eq!(dto.project.status, "Healthy");
        assert_eq!(dto.project.blueprint_version, "0.9.9");
        assert_eq!(dto.project.repos.len(), 1);
        assert_eq!(dto.project.repos[0].name, "wind-farm-analytics-api");
        assert_eq!(
            dto.project.repos[0].html_url,
            "https://github.com/ramboll/wind-farm-analytics-api"
        );
        assert_eq!(dto.project.repos[0].default_branch, "main");
        assert_eq!(dto.project.layout, "multi-repo");
        assert_eq!(dto.project.services[0].service_type, "api");
        assert!(
            dto.project.initialized_by.is_some(),
            "best-effort author is picked from people"
        );
        assert_invariants(&dto, &people, NOW);
    }

    #[test]
    fn catalog_row_without_service_suffix_infers_monolith() {
        let people = people();
        let row = fake_row("data-hub", true);
        let dto = overview("data-hub", Some(&row), &people, NOW).expect("catalog row");
        assert_eq!(dto.project.layout, "monolith");
        assert_eq!(dto.project.blueprint, "monolith-root");
        assert_invariants(&dto, &people, NOW);
    }

    #[test]
    fn empty_people_directory_yields_none() {
        // Every author/triggered_by must be drawn from people; with none, there is no document.
        assert!(overview("RMB-EN-042", None, &[], NOW).is_none());
    }

    // ── property tests: the §18.2 invariants over arbitrary inputs ───────────

    fn id_strategy() -> impl Strategy<Value = String> {
        prop_oneof![
            proptest::sample::select(seeded_ids()).prop_map(ToOwned::to_owned),
            ".{0,24}",
        ]
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(64))]

        #[test]
        fn generator_invariants_hold(
            id in id_strategy(),
            row_kind in 0u8..3u8,
            now in 1_000_000_000i64..2_000_000_000i64,
        ) {
            let people = people();
            let row = match row_kind {
                0 => None,
                1 => Some(fake_row(&id, false)),
                _ => Some(fake_row(&id, true)),
            };
            match overview(&id, row.as_ref(), &people, now) {
                None => prop_assert!(row.is_none(), "a catalog row must always yield Some"),
                Some(dto) => {
                    assert_invariants(&dto, &people, now);
                    // Determinism: identical serialized output for identical inputs.
                    let again = overview(&id, row.as_ref(), &people, now).expect("Some twice");
                    prop_assert_eq!(to_json(&dto), to_json(&again));
                    // Structural stability: a different now only slides timestamps.
                    let later = overview(&id, row.as_ref(), &people, now - 12_345)
                        .expect("Some at any now");
                    let names = |d: &ProjectOverviewDto| -> Vec<String> {
                        d.branches.iter().map(|b| b.name.clone()).collect()
                    };
                    prop_assert_eq!(names(&dto), names(&later));
                    prop_assert_eq!(dto.runs.len(), later.runs.len());
                    prop_assert_eq!(dto.team.len(), later.team.len());
                }
            }
        }
    }

    // ── handler wiring (oneshot, like routes tests) ──────────────────────────

    fn test_state() -> AppState {
        AppState::new(PathBuf::from("../../blueprints"), "test-owner".to_owned())
    }

    async fn get_overview(id: &str) -> Response {
        crate::routes::app(test_state())
            .oneshot(
                Request::builder()
                    .uri(format!("/api/projects/{id}/overview"))
                    .body(Body::empty())
                    .expect("req"),
            )
            .await
            .expect("response")
    }

    async fn body_json(resp: Response) -> serde_json::Value {
        let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
            .await
            .expect("read body");
        serde_json::from_slice(&bytes).expect("json body")
    }

    #[tokio::test]
    async fn overview_endpoint_returns_seeded_project() {
        let resp = get_overview("RMB-EN-042").await;
        assert_eq!(resp.status(), StatusCode::OK);
        let body = body_json(resp).await;
        assert_eq!(body["project"]["id"], "RMB-EN-042");
        assert_eq!(body["project"]["name"], "District Heating Optimizer");
        assert!(
            body["branches"].as_array().expect("branches").len() >= 4,
            "3 rails + >=1 working branch"
        );
        assert!(!body["runs"].as_array().expect("runs").is_empty());
        assert!(!body["team"].as_array().expect("team").is_empty());
        assert!(!body["commits"].as_array().expect("commits").is_empty());
    }

    #[tokio::test]
    async fn overview_endpoint_404_for_unknown_project() {
        let resp = get_overview("nope").await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        let body = body_json(resp).await;
        assert!(body["error"]
            .as_str()
            .expect("error string")
            .contains("unknown project"));
    }
}
