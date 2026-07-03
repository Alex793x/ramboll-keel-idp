//! # keel-cli (library)
//!
//! The headless E2E driver for Keel (SPEC §3.6). Splitting the logic into a library lets us
//! unit-test argument parsing, dept/user resolution, and the dry-run path without a process spawn.
//!
//! ```text
//! keel-cli init --project <name> --department <id> --users <id,id,...>
//!               --service-kind <rest-api|worker> --description <s> --author <s>
//!               [--layout <multi-repo|monolith>] [--services <type:lang,...>]
//!               [--owner Alex793x] [--blueprints <dir>] [--local <dir>] [--dry-run]
//! ```
//!
//! v3 (SPEC §13): `--services api:python,fe:react` selects the project's service components
//! (`fe|api|wk|dp|inf` × language) and `--layout` picks one-repo-per-service (`multi-repo`,
//! the default) or a single `monolith` repo. Without `--services` the legacy single-service
//! path runs unchanged.
//!
//! Provider selection (precedence top-to-bottom):
//! - `--dry-run`      → [`keel_github::FakeProvider`] (no writes, no network)
//! - `--local <dir>`  → [`keel_github::LocalDirProvider`] (real local git repo, no `gh`)
//! - `--octocrab`     → [`keel_github::OctocrabProvider`] (typed SDK, token from `gh auth token`)
//! - otherwise        → [`keel_github::GhCliProvider`] (real `gh` CLI)

#![forbid(unsafe_code)]

use std::path::PathBuf;

use anyhow::{anyhow, Context};
use clap::{Args, Parser, Subcommand};

use keel_core::{
    InitOutcome, InitRequest, MockCatalog, ProgressEvent, Provenance, RepoCoordinates, RepoLayout,
    RepoProvider, Selection, ServiceSelection,
};
use keel_engine::{AddServiceOutcome, AddServiceSpec, Engine};

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
    /// Add ONE service component to an already-initialized project (v5, SPEC §19.5).
    AddService(AddServiceArgs),
}

/// `keel-cli init` flags.
#[derive(Debug, Clone, Args)]
pub struct InitArgs {
    /// Project name (lowercase, `^[a-z][a-z0-9-]{2,40}$`).
    #[arg(long)]
    pub project: String,

    /// Department id from the mock catalog (e.g. `energy`).
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

    /// v3: repo layout — one repo per service, or a single monolith repo.
    #[arg(long, default_value = "multi-repo", value_parser = ["multi-repo", "monolith"])]
    pub layout: String,

    /// v3: comma-separated service components as `type:lang` (e.g. `api:python,fe:react`).
    /// Types: fe|api|wk|dp|inf. Empty ⇒ legacy single-service path.
    #[arg(long, value_delimiter = ',')]
    pub services: Vec<String>,

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

    /// Create the repo via the typed octocrab SDK (auth from `gh auth token`) instead of the gh CLI.
    #[arg(long)]
    pub octocrab: bool,
}

/// Which provider the flags select.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderChoice {
    /// `--dry-run`
    Fake,
    /// `--local <dir>`
    Local(PathBuf),
    /// `--octocrab` — typed octocrab SDK (token from `gh auth token`)
    Octocrab,
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
        } else if self.octocrab {
            ProviderChoice::Octocrab
        } else {
            ProviderChoice::GhCli
        }
    }
}

/// `keel-cli add-service` flags — materialize ONE new component into an existing project.
///
/// The department/users/author/description supply the render context (CODEOWNERS, docs) the same
/// way `init` does — normally the project's original owners. Provider flags mirror `init`.
#[derive(Debug, Clone, Args)]
pub struct AddServiceArgs {
    /// Project slug the component is added to (repo prefix for multi-repo, repo name for monolith).
    #[arg(long)]
    pub project: String,

    /// The component to add, as `type:lang` or `type:lang:name` (e.g. `api:python:ingest`).
    #[arg(long)]
    pub service: String,

    /// Department id from the mock catalog (e.g. `energy`).
    #[arg(long)]
    pub department: String,

    /// Comma-separated owning user ids (e.g. `u-alex,u-bo`).
    #[arg(long, value_delimiter = ',')]
    pub users: Vec<String>,

    /// Author (name or "name <email>").
    #[arg(long)]
    pub author: String,

    /// One-sentence description carried into the rendered docs.
    #[arg(
        long,
        default_value = "Service component added via keel-cli add-service"
    )]
    pub description: String,

    /// Project layout: `multi-repo` (new `{project}-{name}` repo) or `monolith` (commit to `dev`).
    #[arg(long, default_value = "multi-repo", value_parser = ["multi-repo", "monolith"])]
    pub layout: String,

    /// Existing component names already in the project (the collision domain), comma-separated.
    /// Empty ⇒ the added component takes its bare default name.
    #[arg(long, value_delimiter = ',')]
    pub existing: Vec<String>,

    /// GitHub owner new repos are created under.
    #[arg(long, default_value = DEFAULT_OWNER)]
    pub owner: String,

    /// Blueprints directory.
    #[arg(long, default_value = DEFAULT_BLUEPRINTS_DIR)]
    pub blueprints: PathBuf,

    /// Materialize into a local git tree (no `gh`, no network). Multi-repo creates
    /// `<dir>/{project}-{name}`; monolith commits into the existing `<dir>/{project}` repo.
    #[arg(long)]
    pub local: Option<PathBuf>,

    /// Use the in-memory fake provider (no writes, no network).
    #[arg(long)]
    pub dry_run: bool,

    /// Create the repo via the typed octocrab SDK instead of the gh CLI.
    #[arg(long)]
    pub octocrab: bool,
}

impl AddServiceArgs {
    /// Resolve the provider choice from the flags (same precedence as `init`).
    #[must_use]
    pub fn provider_choice(&self) -> ProviderChoice {
        if self.dry_run {
            ProviderChoice::Fake
        } else if let Some(dir) = &self.local {
            ProviderChoice::Local(dir.clone())
        } else if self.octocrab {
            ProviderChoice::Octocrab
        } else {
            ProviderChoice::GhCli
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection → InitRequest (delegates to the shared keel_core catalog)
// ─────────────────────────────────────────────────────────────────────────────

/// Parse the `--layout` / `--services` flags into their typed v3 forms.
///
/// Kept separate from [`resolve_request`] so flag parsing is testable without a catalog.
///
/// # Errors
/// A clear per-flag error: an invalid layout token (normally unreachable — clap restricts the
/// values) or an invalid `type:lang` service entry (message lists the valid types).
pub fn parse_v3_flags(args: &InitArgs) -> anyhow::Result<(RepoLayout, Vec<ServiceSelection>)> {
    let layout: RepoLayout = args
        .layout
        .parse()
        .map_err(|e: keel_core::KeelError| anyhow!("invalid --layout: {e}"))?;
    let services = args
        .services
        .iter()
        .map(|s| {
            ServiceSelection::parse(s).map_err(|e| anyhow!("invalid --services entry {s:?}: {e}"))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    Ok((layout, services))
}

/// Resolve `InitArgs` against the shared mocked catalog into a validated [`InitRequest`].
///
/// The catalog and resolution logic live in [`keel_core::catalog`] (shared with the API), so this
/// only maps CLI flags onto a [`Selection`] and delegates — the two entry points never drift.
/// The v3 flags are parsed here (`--layout` via [`RepoLayout`], each `--services` entry via
/// [`ServiceSelection::parse`]); without `--services` the legacy path is untouched.
///
/// # Errors
/// Surfaces a validation error if the department/user is unknown, no users are given, the service
/// kind is invalid, a v3 flag is malformed, or the request fails basic validation.
pub fn resolve_request(catalog: &MockCatalog, args: &InitArgs) -> anyhow::Result<InitRequest> {
    let (layout, services) = parse_v3_flags(args)?;
    let selection = Selection {
        project_name: args.project.clone(),
        blueprint: args.blueprint.clone(),
        department_id: args.department.clone(),
        user_ids: args.users.clone(),
        service_kind: args.service_kind.clone(),
        description: args.description.clone(),
        author: args.author.clone(),
        layout,
        services,
    };
    catalog
        .resolve(&selection)
        .map_err(|e| anyhow!(e.to_string()))
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
    let catalog = MockCatalog::load();
    let req = resolve_request(&catalog, args)?;
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
        ProviderChoice::Octocrab => {
            let provider =
                keel_github::OctocrabProvider::from_gh().map_err(|e| anyhow!(e.to_string()))?;
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

/// Format a single add-service progress event (4-step: form/render/create_repo|commit/register).
#[must_use]
pub fn format_add_event(ev: &ProgressEvent) -> String {
    let status = match ev.status {
        keel_core::Status::Started => "…",
        keel_core::Status::Done => "✓",
        keel_core::Status::Skipped => "·",
        keel_core::Status::Error => "✗",
    };
    if ev.detail.is_empty() {
        format!("[{}/4] {} {} — {}", ev.step, status, ev.key, ev.title)
    } else {
        format!(
            "[{}/4] {} {} — {} ({})",
            ev.step, status, ev.key, ev.title, ev.detail
        )
    }
}

/// Execute the `add-service` subcommand end-to-end (resolve context → materialize → print).
///
/// Rebuilds the render-context donor from the given department/owners/author (as `init` does),
/// parses the single `--service`, and drives [`Engine::add_service`] with the selected provider.
/// Multi-repo creates a new `{project}-{name}` repo; monolith commits to the project repo's `dev`.
///
/// # Errors
/// Any resolution or engine error (caller maps this to a non-zero exit code).
pub fn execute_add_service(args: &AddServiceArgs) -> anyhow::Result<AddServiceOutcome> {
    let catalog = MockCatalog::load();
    let layout: RepoLayout = args
        .layout
        .parse()
        .map_err(|e: keel_core::KeelError| anyhow!("invalid --layout: {e}"))?;

    // Resolve the render context (department + owners) exactly like `init`; the service set comes
    // from --service, so the donor's own `services` stays empty.
    let donor_selection = Selection {
        project_name: args.project.clone(),
        blueprint: "multi-service".to_owned(),
        department_id: args.department.clone(),
        user_ids: args.users.clone(),
        service_kind: "rest-api".to_owned(),
        description: args.description.clone(),
        author: args.author.clone(),
        layout,
        services: Vec::new(),
    };
    let resolved = catalog
        .resolve(&donor_selection)
        .map_err(|e| anyhow!(e.to_string()))?;
    // Round-trip through Provenance so the CLI donor is byte-for-byte the API's materialization donor.
    let donor = Provenance::from_request(&resolved).to_request(&args.project);

    let selection = ServiceSelection::parse(&args.service)
        .map_err(|e| anyhow!("invalid --service {:?}: {e}", args.service))?;

    let engine = Engine::new(args.blueprints.clone(), args.owner.clone());

    // Monolith commits into the existing project repo; multi-repo creates a fresh one.
    let base_repo = match layout {
        RepoLayout::Monolith => Some(RepoCoordinates {
            owner: args.owner.clone(),
            name: args.project.clone(),
            html_url: String::new(),
            default_branch: "main".to_owned(),
            branches: vec!["main".to_owned(), "dev".to_owned(), "staging".to_owned()],
        }),
        RepoLayout::MultiRepo => None,
    };

    let spec = AddServiceSpec {
        project_slug: &args.project,
        layout,
        selection: &selection,
        existing_names: &args.existing,
        base_repo: base_repo.as_ref(),
        request: &donor,
    };

    let mut sink = |ev: &ProgressEvent| eprintln!("{}", format_add_event(ev));

    let outcome = match args.provider_choice() {
        ProviderChoice::Fake => {
            let provider = keel_github::FakeProvider::new();
            engine.add_service(&spec, &provider, &mut sink)
        }
        ProviderChoice::Local(dir) => {
            let provider = keel_github::LocalDirProvider::new(dir);
            engine.add_service(&spec, &provider, &mut sink)
        }
        ProviderChoice::Octocrab => {
            let provider =
                keel_github::OctocrabProvider::from_gh().map_err(|e| anyhow!(e.to_string()))?;
            engine.add_service(&spec, &provider, &mut sink)
        }
        ProviderChoice::GhCli => {
            let provider = keel_github::GhCliProvider::new(args.owner.clone());
            engine.add_service(&spec, &provider, &mut sink)
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
        Command::AddService(args) => {
            execute_add_service(&args)?;
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
            Command::AddService(_) => panic!("expected an init command"),
        }
    }

    fn add_service_args(argv: &[&str]) -> AddServiceArgs {
        match parse(argv).command {
            Command::AddService(a) => a,
            Command::Init(_) => panic!("expected an add-service command"),
        }
    }

    #[test]
    fn add_service_parses_service_provider_and_existing_flags() {
        let args = add_service_args(&[
            "keel-cli",
            "add-service",
            "--project",
            "demo",
            "--service",
            "api:python:ingest",
            "--department",
            "energy",
            "--users",
            "u-alex,u-bo",
            "--author",
            "Alex",
            "--local",
            "/tmp/out",
            "--existing",
            "api,fe",
        ]);
        assert_eq!(args.project, "demo");
        assert_eq!(args.users, vec!["u-alex", "u-bo"]);
        assert_eq!(args.existing, vec!["api", "fe"]);
        assert_eq!(args.layout, "multi-repo", "layout defaults to multi-repo");
        assert_eq!(
            args.provider_choice(),
            ProviderChoice::Local(PathBuf::from("/tmp/out"))
        );
        // The `type:lang:name` form carries the explicit component name through.
        let sel = ServiceSelection::parse(&args.service).expect("valid service");
        assert_eq!(sel.name.as_deref(), Some("ingest"));
    }

    #[test]
    fn add_service_existing_defaults_to_empty() {
        let args = add_service_args(&[
            "keel-cli",
            "add-service",
            "--project",
            "demo",
            "--service",
            "fe:react",
            "--department",
            "energy",
            "--users",
            "u-alex",
            "--author",
            "Alex",
            "--dry-run",
        ]);
        assert!(
            args.existing.is_empty(),
            "no --existing ⇒ empty collision domain"
        );
        assert_eq!(args.provider_choice(), ProviderChoice::Fake);
    }

    #[test]
    fn parses_full_init() {
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "invoicing-api",
            "--department",
            "energy",
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
        assert_eq!(args.department, "energy");
        assert_eq!(args.users, vec!["u-alex", "u-bo"]);
        assert_eq!(args.service_kind, "rest-api");
        assert_eq!(args.blueprint, "python-service"); // default
        assert_eq!(args.owner, DEFAULT_OWNER); // default
        assert_eq!(args.layout, "multi-repo"); // default (v3)
        assert!(args.services.is_empty()); // default (v3): legacy path
        assert!(!args.dry_run);
        assert!(args.local.is_none());
    }

    /// A minimal valid legacy argv, extendable with extra flags per test.
    fn base_argv(extra: &[&str]) -> Vec<&'static str> {
        let mut argv = vec![
            "keel-cli",
            "init",
            "--project",
            "invoicing-api",
            "--department",
            "energy",
            "--users",
            "u-alex",
            "--service-kind",
            "rest-api",
            "--description",
            "d",
            "--author",
            "a",
        ];
        for e in extra {
            // Leak: test-only, keeps the helper signature simple for literal flags.
            argv.push(Box::leak((*e).to_owned().into_boxed_str()));
        }
        argv
    }

    #[test]
    fn parses_v3_layout_and_services_flags() {
        let args = init_args(&base_argv(&[
            "--layout",
            "monolith",
            "--services",
            "api:python,fe:react",
        ]));
        assert_eq!(args.layout, "monolith");
        assert_eq!(args.services, vec!["api:python", "fe:react"]);

        let (layout, services) = parse_v3_flags(&args).expect("valid v3 flags");
        assert_eq!(layout, RepoLayout::Monolith);
        assert_eq!(
            services,
            vec![
                ServiceSelection {
                    service_type: keel_core::ServiceType::Api,
                    language: "python".to_owned(),
                    name: None,
                },
                ServiceSelection {
                    service_type: keel_core::ServiceType::Fe,
                    language: "react".to_owned(),
                    name: None,
                },
            ]
        );
    }

    #[test]
    fn layout_defaults_to_multi_repo_and_rejects_unknown_tokens() {
        let args = init_args(&base_argv(&[]));
        let (layout, services) = parse_v3_flags(&args).expect("defaults are valid");
        assert_eq!(layout, RepoLayout::MultiRepo);
        assert!(services.is_empty());

        // clap's value_parser restricts --layout to the two tokens.
        assert!(Cli::try_parse_from(base_argv(&["--layout", "solo"])).is_err());
    }

    #[test]
    fn invalid_services_entry_errors_mentioning_the_valid_types() {
        let args = init_args(&base_argv(&["--services", "gpu:python"]));
        let err = parse_v3_flags(&args).expect_err("gpu is not a service type");
        let msg = err.to_string();
        assert!(msg.contains("gpu"), "names the bad entry: {msg}");
        assert!(
            msg.contains("fe|api|wk|dp|inf"),
            "lists the valid types: {msg}"
        );

        // The same error surfaces through resolve_request (parsed at resolve time).
        let catalog = MockCatalog::embedded();
        let err = resolve_request(&catalog, &args).expect_err("propagates");
        assert!(err.to_string().contains("fe|api|wk|dp|inf"));

        // Malformed pair (no colon) also errors clearly.
        let args = init_args(&base_argv(&["--services", "api"]));
        let msg = parse_v3_flags(&args).expect_err("no colon").to_string();
        assert!(msg.contains("type:lang"), "explains the shape: {msg}");
    }

    #[test]
    fn resolve_request_maps_v3_flags_into_the_init_request() {
        let catalog = MockCatalog::embedded();
        let args = init_args(&base_argv(&[
            "--layout",
            "monolith",
            "--services",
            "api:python,fe:react",
        ]));
        let req = resolve_request(&catalog, &args).expect("valid v3 request");
        assert_eq!(req.layout, RepoLayout::Monolith);
        assert_eq!(req.services.len(), 2);
        assert_eq!(req.services[0].blueprint_name(), "api-python");
        assert_eq!(req.services[1].blueprint_name(), "fe-react");
    }

    #[test]
    fn legacy_invocation_resolves_to_the_v2_request_shape() {
        // No --layout / --services ⇒ default layout + empty services: the legacy path untouched.
        let catalog = MockCatalog::embedded();
        let args = init_args(&base_argv(&[]));
        let req = resolve_request(&catalog, &args).expect("valid legacy request");
        assert_eq!(req.layout, RepoLayout::default());
        assert!(req.services.is_empty());
        assert_eq!(req.project_name, "invoicing-api");
        assert_eq!(req.users[0].github_login, "Alex793x");
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
    fn octocrab_flag_selects_octocrab_provider() {
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
            "--octocrab",
        ]);
        assert!(args.octocrab);
        assert_eq!(args.provider_choice(), ProviderChoice::Octocrab);
        // --dry-run still wins over --octocrab.
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
            "--octocrab",
            "--dry-run",
        ]);
        assert_eq!(args.provider_choice(), ProviderChoice::Fake);
    }

    #[test]
    fn resolve_request_maps_flags_to_selection_and_delegates() {
        // The full resolution matrix lives in keel_core::catalog tests; here we only assert the CLI
        // wiring: flags → Selection → catalog.resolve, for one valid and one invalid case.
        let catalog = MockCatalog::embedded();

        let ok = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "invoicing-api",
            "--department",
            "energy",
            "--users",
            "u-alex",
            "--service-kind",
            "rest-api",
            "--description",
            "d",
            "--author",
            "a",
        ]);
        let req = resolve_request(&catalog, &ok).expect("valid");
        assert_eq!(req.project_name, "invoicing-api");
        assert_eq!(req.users[0].github_login, "Alex793x");
        assert_eq!(req.department.team_slug, "energy");

        let bad = init_args(&[
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
        assert!(resolve_request(&catalog, &bad)
            .unwrap_err()
            .to_string()
            .contains("department"));
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
        let catalog = MockCatalog::embedded();
        let args = init_args(&[
            "keel-cli",
            "init",
            "--project",
            "smoke-test",
            "--department",
            "energy",
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
        let req = resolve_request(&catalog, &args).expect("valid");
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
