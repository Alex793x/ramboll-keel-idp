//! # keel-cli (library)
//!
//! The headless E2E driver for Keel (SPEC §3.6). Splitting the logic into a library lets us
//! unit-test argument parsing, dept/user resolution, and the dry-run path without a process spawn.
//!
//! ```text
//! keel-cli init --project <name> --department <id> --users <id,id,...>
//!               --service-kind <rest-api|worker> --description <s> --author <s>
//!               [--owner Alex793x] [--blueprints <dir>] [--local <dir>] [--dry-run]
//! ```
//!
//! Provider selection:
//! - `--dry-run`      → [`keel_github::FakeProvider`] (no writes, no network)
//! - `--local <dir>`  → [`keel_github::LocalDirProvider`] (real local git repo, no `gh`)
//! - otherwise        → [`keel_github::GhCliProvider`] (real `gh`)

#![forbid(unsafe_code)]

use std::path::PathBuf;

use anyhow::{anyhow, Context};
use clap::{Args, Parser, Subcommand};
use serde::Deserialize;

use keel_core::{
    Department, InitOutcome, InitRequest, ProgressEvent, RepoProvider, ServiceKind, User,
};
use keel_engine::Engine;

/// Embedded copy of the canonical mock catalog, used when the runtime fixture is absent.
const MOCK_DATA_EMBEDDED: &str = include_str!("../../../fixtures/mock-data.json");

/// Default GitHub owner for new repos.
pub const DEFAULT_OWNER: &str = "Alex793x";
/// Default blueprints directory.
pub const DEFAULT_BLUEPRINTS_DIR: &str = "blueprints";

// ─────────────────────────────────────────────────────────────────────────────
// CLI definition
// ─────────────────────────────────────────────────────────────────────────────

/// Keel — initialize a standards-compliant project repository.
#[derive(Debug, Parser)]
#[command(
    name = "keel-cli",
    version,
    about = "Keel project initializer (E2E driver)"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

/// Top-level subcommands.
#[derive(Debug, Subcommand)]
pub enum Command {
    /// Initialize a new project repository from a blueprint.
    Init(InitArgs),
}

/// `keel-cli init` flags.
#[derive(Debug, Clone, Args)]
pub struct InitArgs {
    /// Project name (lowercase, `^[a-z][a-z0-9-]{2,40}$`).
    #[arg(long)]
    pub project: String,

    /// Department id from the mock catalog (e.g. `platform-engineering`).
    #[arg(long)]
    pub department: String,

    /// Comma-separated owning user ids (e.g. `u-alex,u-bo`).
    #[arg(long, value_delimiter = ',')]
    pub users: Vec<String>,

    /// Service kind.
    #[arg(long = "service-kind", value_parser = ["rest-api", "worker"])]
    pub service_kind: String,

    /// One-sentence description.
    #[arg(long)]
    pub description: String,

    /// Author (name or "name <email>").
    #[arg(long)]
    pub author: String,

    /// Blueprint to use.
    #[arg(long, default_value = "python-service")]
    pub blueprint: String,

    /// GitHub owner new repos are created under.
    #[arg(long, default_value = DEFAULT_OWNER)]
    pub owner: String,

    /// Blueprints directory.
    #[arg(long, default_value = DEFAULT_BLUEPRINTS_DIR)]
    pub blueprints: PathBuf,

    /// Write a real local git repo to this directory (no `gh`, no network).
    #[arg(long)]
    pub local: Option<PathBuf>,

    /// Use the in-memory fake provider (no writes, no network).
    #[arg(long)]
    pub dry_run: bool,
}

/// Which provider the flags select.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderChoice {
    /// `--dry-run`
    Fake,
    /// `--local <dir>`
    Local(PathBuf),
    /// real `gh`
    GhCli,
}

impl InitArgs {
    /// Resolve the provider choice from the flags. `--dry-run` wins over `--local`.
    #[must_use]
    pub fn provider_choice(&self) -> ProviderChoice {
        if self.dry_run {
            ProviderChoice::Fake
        } else if let Some(dir) = &self.local {
            ProviderChoice::Local(dir.clone())
        } else {
            ProviderChoice::GhCli
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

/// A department record from `fixtures/mock-data.json`.
#[derive(Debug, Clone, Deserialize)]
pub struct DepartmentRecord {
    pub id: String,
    pub name: String,
    pub team_slug: String,
    #[serde(default)]
    pub users: Vec<User>,
}

impl DepartmentRecord {
    #[must_use]
    pub fn department(&self) -> Department {
        Department {
            id: self.id.clone(),
            name: self.name.clone(),
            team_slug: self.team_slug.clone(),
        }
    }
}

/// Parsed mock catalog.
#[derive(Debug, Clone, Deserialize)]
pub struct MockData {
    pub departments: Vec<DepartmentRecord>,
}

impl MockData {
    /// Load the catalog: prefer `fixtures/mock-data.json` relative to CWD, else the embedded copy.
    #[must_use]
    pub fn load() -> Self {
        let candidate = PathBuf::from("fixtures/mock-data.json");
        if let Ok(raw) = std::fs::read_to_string(&candidate) {
            if let Ok(data) = serde_json::from_str(&raw) {
                return data;
            }
        }
        Self::embedded()
    }

    /// Parse the compiled-in copy.
    #[must_use]
    pub fn embedded() -> Self {
        serde_json::from_str(MOCK_DATA_EMBEDDED).expect("embedded mock-data.json is valid")
    }

    /// Parse from a raw JSON string (tests).
    ///
    /// # Errors
    /// Surfaces the underlying `serde_json` error.
    pub fn parse_json(raw: &str) -> serde_json::Result<Self> {
        serde_json::from_str(raw)
    }

    #[must_use]
    pub fn department(&self, id: &str) -> Option<&DepartmentRecord> {
        self.departments.iter().find(|d| d.id == id)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure resolution: args + catalog → InitRequest
// ─────────────────────────────────────────────────────────────────────────────

/// Resolve `InitArgs` against the catalog into a validated [`keel_core::InitRequest`].
///
/// Pure (no I/O beyond reading the in-memory catalog), so it is fully unit-testable.
///
/// # Errors
/// Returns a descriptive error if the department or any user id is unknown, no users are given,
/// the service kind is invalid, or the request fails basic validation.
pub fn resolve_request(data: &MockData, args: &InitArgs) -> anyhow::Result<InitRequest> {
    let dept = data
        .department(&args.department)
        .ok_or_else(|| anyhow!("unknown department: {:?}", args.department))?;

    if args.users.is_empty() {
        return Err(anyhow!("at least one --users id is required"));
    }

    let mut users: Vec<User> = Vec::with_capacity(args.users.len());
    for uid in &args.users {
        let user = dept
            .users
            .iter()
            .find(|u| &u.id == uid)
            .cloned()
            .ok_or_else(|| {
                anyhow!(
                    "unknown user id {uid:?} for department {:?}",
                    args.department
                )
            })?;
        users.push(user);
    }

    let service_kind: ServiceKind = args
        .service_kind
        .parse()
        .with_context(|| format!("invalid service kind: {:?}", args.service_kind))?;

    let req = InitRequest {
        project_name: args.project.clone(),
        blueprint: args.blueprint.clone(),
        department: dept.department(),
        users,
        service_kind,
        description: args.description.clone(),
        author: args.author.clone(),
    };

    req.validate_basic().map_err(|e| anyhow!(e.to_string()))?;
    Ok(req)
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────────────────

/// Format a single progress event for human-readable streaming output.
#[must_use]
pub fn format_event(ev: &ProgressEvent) -> String {
    let status = match ev.status {
        keel_core::Status::Started => "…",
        keel_core::Status::Done => "✓",
        keel_core::Status::Skipped => "·",
        keel_core::Status::Error => "✗",
    };
    if ev.detail.is_empty() {
        format!("[{}/8] {} {} — {}", ev.step, status, ev.key, ev.title)
    } else {
        format!(
            "[{}/8] {} {} — {} ({})",
            ev.step, status, ev.key, ev.title, ev.detail
        )
    }
}

/// Run initialization with an already-constructed engine + provider, streaming events to `sink`.
///
/// Kept provider-generic so tests can drive it with `FakeProvider`.
///
/// # Errors
/// Propagates any [`keel_core::KeelError`] from the engine.
pub fn run_initialize(
    engine: &Engine,
    req: &InitRequest,
    provider: &dyn RepoProvider,
    sink: &mut dyn FnMut(&ProgressEvent),
) -> keel_core::Result<InitOutcome> {
    engine.initialize(req, provider, sink)
}

/// Execute the `init` subcommand end-to-end (parse → resolve → run → print).
///
/// Prints each [`keel_core::ProgressEvent`] to stderr as it arrives, then the final
/// [`keel_core::InitOutcome`] as pretty JSON to stdout.
///
/// # Errors
/// Any resolution or engine error (caller maps this to a non-zero exit code).
pub fn execute_init(args: &InitArgs) -> anyhow::Result<InitOutcome> {
    let data = MockData::load();
    let req = resolve_request(&data, args)?;
    let engine = Engine::new(args.blueprints.clone(), args.owner.clone());

    let mut events: Vec<ProgressEvent> = Vec::new();
    let mut sink = |ev: &ProgressEvent| {
        eprintln!("{}", format_event(ev));
        events.push(ev.clone());
    };

    let outcome = match args.provider_choice() {
        ProviderChoice::Fake => {
            let provider = keel_github::FakeProvider::new();
            run_initialize(&engine, &req, &provider, &mut sink)
        }
        ProviderChoice::Local(dir) => {
            let provider = keel_github::LocalDirProvider::new(dir);
            run_initialize(&engine, &req, &provider, &mut sink)
        }
        ProviderChoice::GhCli => {
            let provider = keel_github::GhCliProvider::new(args.owner.clone());
            run_initialize(&engine, &req, &provider, &mut sink)
        }
    }
    .map_err(|e| anyhow!(e.to_string()))?;

    let json = serde_json::to_string_pretty(&outcome).context("serializing outcome")?;
    println!("{json}");
    Ok(outcome)
}

/// Dispatch a parsed [`Cli`].
///
/// # Errors
/// Propagates command failures.
pub fn dispatch(cli: Cli) -> anyhow::Result<()> {
    match cli.command {
        Command::Init(args) => {
            execute_init(&args)?;
            Ok(())
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(argv: &[&str]) -> Cli {
        Cli::try_parse_from(argv).expect("parse")
    }

    fn init_args(argv: &[&str]) -> InitArgs {
        match parse(argv).command {
            Command::Init(a) => a,
        }
    }

    #[test]
    fn parses_full_init() {
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "invoicing-api",
            "--department",
            "platform-engineering",
            "--users",
            "u-alex,u-bo",
            "--service-kind",
            "rest-api",
            "--description",
            "An invoicing service",
            "--author",
            "Alex Holmberg",
        ]);
        assert_eq!(args.project, "invoicing-api");
        assert_eq!(args.department, "platform-engineering");
        assert_eq!(args.users, vec!["u-alex", "u-bo"]);
        assert_eq!(args.service_kind, "rest-api");
        assert_eq!(args.blueprint, "python-service"); // default
        assert_eq!(args.owner, DEFAULT_OWNER); // default
        assert!(!args.dry_run);
        assert!(args.local.is_none());
    }

    #[test]
    fn rejects_invalid_service_kind() {
        let res = Cli::try_parse_from([
            "keel-cli",
            "init",
            "--project",
            "abc",
            "--department",
            "x",
            "--users",
            "u",
            "--service-kind",
            "frontend",
            "--description",
            "d",
            "--author",
            "a",
        ]);
        assert!(res.is_err());
    }

    #[test]
    fn missing_required_flag_errors() {
        // No --author.
        let res = Cli::try_parse_from([
            "keel-cli",
            "init",
            "--project",
            "abc",
            "--department",
            "x",
            "--users",
            "u",
            "--service-kind",
            "worker",
            "--description",
            "d",
        ]);
        assert!(res.is_err());
    }

    #[test]
    fn dry_run_and_local_flags_parse() {
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "abc",
            "--department",
            "x",
            "--users",
            "u",
            "--service-kind",
            "worker",
            "--description",
            "d",
            "--author",
            "a",
            "--dry-run",
        ]);
        assert!(args.dry_run);
        assert_eq!(args.provider_choice(), ProviderChoice::Fake);

        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "abc",
            "--department",
            "x",
            "--users",
            "u",
            "--service-kind",
            "worker",
            "--description",
            "d",
            "--author",
            "a",
            "--local",
            "/tmp/out",
        ]);
        assert_eq!(
            args.provider_choice(),
            ProviderChoice::Local(PathBuf::from("/tmp/out"))
        );
    }

    #[test]
    fn dry_run_wins_over_local() {
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "abc",
            "--department",
            "x",
            "--users",
            "u",
            "--service-kind",
            "worker",
            "--description",
            "d",
            "--author",
            "a",
            "--local",
            "/tmp/out",
            "--dry-run",
        ]);
        assert_eq!(args.provider_choice(), ProviderChoice::Fake);
    }

    #[test]
    fn embedded_mock_data_loads() {
        let data = MockData::embedded();
        assert!(data.department("platform-engineering").is_some());
    }

    #[test]
    fn resolve_valid() {
        let data = MockData::embedded();
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "invoicing-api",
            "--department",
            "platform-engineering",
            "--users",
            "u-alex",
            "--service-kind",
            "rest-api",
            "--description",
            "d",
            "--author",
            "a",
        ]);
        let req = resolve_request(&data, &args).expect("valid");
        assert_eq!(req.project_name, "invoicing-api");
        assert_eq!(req.users.len(), 1);
        assert_eq!(req.users[0].github_login, "Alex793x");
        assert_eq!(req.department.team_slug, "platform-engineering");
    }

    #[test]
    fn resolve_multiple_users_in_order() {
        let data = MockData::embedded();
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "abc",
            "--department",
            "platform-engineering",
            "--users",
            "u-bo,u-alex",
            "--service-kind",
            "worker",
            "--description",
            "d",
            "--author",
            "a",
        ]);
        let req = resolve_request(&data, &args).expect("valid");
        assert_eq!(req.users.len(), 2);
        assert_eq!(req.users[0].id, "u-bo");
        assert_eq!(req.users[1].id, "u-alex");
    }

    #[test]
    fn resolve_unknown_department_errors() {
        let data = MockData::embedded();
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "abc",
            "--department",
            "nope",
            "--users",
            "u-alex",
            "--service-kind",
            "rest-api",
            "--description",
            "d",
            "--author",
            "a",
        ]);
        let err = resolve_request(&data, &args).unwrap_err();
        assert!(err.to_string().contains("department"));
    }

    #[test]
    fn resolve_unknown_user_errors() {
        let data = MockData::embedded();
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "abc",
            "--department",
            "platform-engineering",
            "--users",
            "u-ghost",
            "--service-kind",
            "rest-api",
            "--description",
            "d",
            "--author",
            "a",
        ]);
        let err = resolve_request(&data, &args).unwrap_err();
        assert!(err.to_string().contains("user"));
    }

    #[test]
    fn resolve_user_from_wrong_department_errors() {
        // u-anya is in "buildings".
        let data = MockData::embedded();
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "abc",
            "--department",
            "platform-engineering",
            "--users",
            "u-anya",
            "--service-kind",
            "rest-api",
            "--description",
            "d",
            "--author",
            "a",
        ]);
        assert!(resolve_request(&data, &args).is_err());
    }

    #[test]
    fn resolve_bad_project_name_errors() {
        let data = MockData::embedded();
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "Bad_Name",
            "--department",
            "platform-engineering",
            "--users",
            "u-alex",
            "--service-kind",
            "rest-api",
            "--description",
            "d",
            "--author",
            "a",
        ]);
        assert!(resolve_request(&data, &args).is_err());
    }

    #[test]
    fn format_event_renders() {
        let ev = ProgressEvent::new(
            3,
            "render",
            "Render templates",
            keel_core::Status::Done,
            "12 files",
        );
        let s = format_event(&ev);
        assert!(s.contains("[3/8]"));
        assert!(s.contains("render"));
        assert!(s.contains("12 files"));
    }

    /// Run-level smoke that exercises the engine via `FakeProvider`. Ignored because it depends on
    /// `keel_engine::Engine::initialize` (built in parallel by Fleet-Engine-RS) and
    /// `keel_blueprint::render` being implemented; until then it would hit `todo!()` and panic.
    /// The orchestrator can run it with `cargo test -p keel-cli -- --ignored` once those land.
    #[test]
    #[ignore = "depends on keel-engine + keel-blueprint bodies (parallel build)"]
    fn dry_run_smoke_with_fake_provider() {
        let data = MockData::embedded();
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "smoke-test",
            "--department",
            "platform-engineering",
            "--users",
            "u-alex",
            "--service-kind",
            "rest-api",
            "--description",
            "smoke",
            "--author",
            "tester",
            "--dry-run",
        ]);
        let req = resolve_request(&data, &args).expect("valid");
        let engine = Engine::new(PathBuf::from("../../blueprints"), args.owner.clone());
        let provider = keel_github::FakeProvider::new();
        let mut events = Vec::new();
        let outcome = run_initialize(&engine, &req, &provider, &mut |ev| events.push(ev.clone()))
            .expect("engine initialize");
        assert_eq!(outcome.project, "smoke-test");
        assert_eq!(provider.created().len(), 1);
        // All 8 steps emitted, in order.
        assert_eq!(events.len(), 8);
    }
}
