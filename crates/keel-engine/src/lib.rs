//! # keel-engine
//!
//! The orchestration plane: [`Engine::initialize`] runs the 8 ordered, idempotent steps
//! (`signin → form → render → create_repo → commit → branches → seed_ci → register`), emitting a
//! [`keel_core::ProgressEvent`] per step and persisting the result to a JSON catalog/audit file.
//!
//! All GitHub I/O goes through an injected [`keel_core::RepoProvider`], so the workflow is
//! unit/property-tested with `keel_github::FakeProvider` — no network required.
//!
//! > Phase-0 stub: signatures frozen; `Fleet-Engine-RS` fills `initialize` + `list_projects` + tests.

#![forbid(unsafe_code)]

use std::path::{Path, PathBuf};

use keel_core::{InitOutcome, InitRequest, ProgressEvent, RepoProvider, Result};

/// The initialization engine. Holds the blueprint search path and the catalog location.
#[derive(Debug, Clone)]
pub struct Engine {
    blueprints_dir: PathBuf,
    catalog_path: PathBuf,
}

impl Engine {
    /// Create an engine that reads blueprints from `blueprints_dir` and writes the catalog to
    /// `<blueprints_dir>/../.keel/catalog.json`.
    #[must_use]
    pub fn new(blueprints_dir: PathBuf) -> Self {
        let catalog_path = blueprints_dir
            .parent()
            .unwrap_or(Path::new("."))
            .join(".keel")
            .join("catalog.json");
        Self { blueprints_dir, catalog_path }
    }

    /// Create an engine with an explicit catalog path (used by tests).
    #[must_use]
    pub fn with_catalog(blueprints_dir: PathBuf, catalog_path: PathBuf) -> Self {
        Self { blueprints_dir, catalog_path }
    }

    /// Directory blueprints are loaded from.
    #[must_use]
    pub fn blueprints_dir(&self) -> &Path {
        &self.blueprints_dir
    }

    /// Path of the JSON catalog/audit file.
    #[must_use]
    pub fn catalog_path(&self) -> &Path {
        &self.catalog_path
    }

    /// Run the full 8-step workflow. Idempotent: re-running for an existing repo does not create a
    /// second repository or duplicate the catalog entry.
    ///
    /// # Errors
    /// Propagates validation, render, and provider errors as [`keel_core::KeelError`].
    pub fn initialize(
        &self,
        _req: &InitRequest,
        _provider: &dyn RepoProvider,
        _on_event: &mut dyn FnMut(&ProgressEvent),
    ) -> Result<InitOutcome> {
        todo!("Fleet-Engine-RS: implement the 8 ordered idempotent steps")
    }

    /// All projects recorded in the catalog.
    ///
    /// # Errors
    /// [`keel_core::KeelError::Io`] if the catalog cannot be read/parsed.
    pub fn list_projects(&self) -> Result<Vec<InitOutcome>> {
        todo!("Fleet-Engine-RS: read the JSON catalog")
    }
}
