//! Shared application state + configuration defaults.

use std::path::PathBuf;
use std::sync::Arc;

use keel_core::MockCatalog;
use keel_engine::Engine;

/// Default GitHub owner new repos are created under (overridable via `KEEL_OWNER`).
pub const DEFAULT_OWNER: &str = "Alex793x";

/// Default blueprints directory (overridable via `KEEL_BLUEPRINTS_DIR`).
pub const DEFAULT_BLUEPRINTS_DIR: &str = "blueprints";

/// Default bind address (overridable via `KEEL_API_ADDR`).
pub const DEFAULT_ADDR: &str = "0.0.0.0:8787";

/// Application state shared by every handler.
///
/// Intentionally holds **no** [`keel_core::RepoProvider`] — providers (e.g. `FakeProvider`) are not
/// `Sync`, and the `gh`-backed provider must be created per request anyway.
#[derive(Clone)]
pub struct AppState {
    pub data: Arc<MockCatalog>,
    pub engine: Arc<Engine>,
    pub blueprints_dir: PathBuf,
    pub owner: String,
}

impl AppState {
    /// Build the default state from environment overrides (`KEEL_BLUEPRINTS_DIR`, `KEEL_OWNER`).
    #[must_use]
    pub fn from_env() -> Self {
        let blueprints_dir = std::env::var("KEEL_BLUEPRINTS_DIR")
            .unwrap_or_else(|_| DEFAULT_BLUEPRINTS_DIR.to_owned());
        let owner = std::env::var("KEEL_OWNER").unwrap_or_else(|_| DEFAULT_OWNER.to_owned());
        Self::new(PathBuf::from(blueprints_dir), owner)
    }

    /// Build state from an explicit blueprints dir + owner.
    #[must_use]
    pub fn new(blueprints_dir: PathBuf, owner: String) -> Self {
        let engine = Engine::new(blueprints_dir.clone(), owner.clone());
        Self {
            data: Arc::new(MockCatalog::embedded()),
            engine: Arc::new(engine),
            blueprints_dir,
            owner,
        }
    }
}
