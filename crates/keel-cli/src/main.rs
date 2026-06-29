//! keel-cli binary — the deterministic E2E driver (SPEC §3.6).
//!
//! ```text
//! keel-cli init --project <name> --department <id> --users <id,id,...>
//!               --service-kind <rest-api|worker> --description <s> --author <s>
//!               [--owner Alex793x] [--blueprints <dir>] [--local <dir>] [--dry-run]
//! ```

use clap::Parser;

use keel_cli::{dispatch, Cli};

fn main() {
    let cli = Cli::parse();
    if let Err(e) = dispatch(cli) {
        eprintln!("error: {e:#}");
        std::process::exit(1);
    }
}
