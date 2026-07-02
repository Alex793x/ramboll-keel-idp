//! `keel.additions.json` — the tiny JSON overlay store for v5 service additions (SPEC §19.4).
//!
//! Seeded design projects (RMB-*) have no repository to push to, so an addition is persisted
//! here (catalog-only); real projects also append here so the new chip appears on the dashboard
//! immediately regardless of layout. `overview()` merges the overlay into `project.services`
//! for both kinds, so additions survive restarts.
//!
//! Shape on disk: `{ "<project id>": [OverviewService, …], … }` — written atomically
//! (temp + rename, like the engine's catalog.rs), gitignored, sibling of the catalog store.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use keel_core::{KeelError, Result};

use crate::overview::ServiceDto;

/// The overlay file name (sibling of the engine's `catalog.json`).
pub const ADDITIONS_FILE: &str = "keel.additions.json";

/// A handle on the overlay store at a fixed path. Stateless: every operation re-reads the file,
/// so concurrent AppStates over the same store dir stay consistent.
#[derive(Debug, Clone)]
pub struct AdditionsStore {
    path: PathBuf,
}

impl AdditionsStore {
    /// A store at `path` (the file need not exist yet).
    #[must_use]
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Read + parse the whole overlay. A missing or empty file is an empty overlay.
    ///
    /// # Errors
    /// [`KeelError::Io`] if the file exists but cannot be read or parsed.
    pub fn load(&self) -> Result<BTreeMap<String, Vec<ServiceDto>>> {
        match fs::read(&self.path) {
            Ok(bytes) => {
                if bytes.iter().all(u8::is_ascii_whitespace) {
                    return Ok(BTreeMap::new());
                }
                serde_json::from_slice(&bytes)
                    .map_err(|e| KeelError::Io(format!("parse {}: {e}", self.path.display())))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(e) => Err(KeelError::Io(format!("read {}: {e}", self.path.display()))),
        }
    }

    /// Append one added service under `id` and persist atomically (temp + rename).
    ///
    /// # Errors
    /// [`KeelError::Io`] on read/parse/write failure.
    pub fn append(&self, id: &str, service: ServiceDto) -> Result<()> {
        let mut overlay = self.load()?;
        overlay.entry(id.to_owned()).or_default().push(service);
        write_atomic(&self.path, &overlay)
    }

    /// The overlay services recorded for `id` — best-effort (an unreadable overlay degrades to
    /// empty, mirroring how the overview handler degrades a failing catalog read).
    #[must_use]
    pub fn for_project(&self, id: &str) -> Vec<ServiceDto> {
        self.load()
            .unwrap_or_default()
            .remove(id)
            .unwrap_or_default()
    }
}

/// Atomically write the overlay: temp sibling + rename, creating parent dirs as needed —
/// the same crash-safety pattern as the engine's catalog.rs.
fn write_atomic(path: &Path, overlay: &BTreeMap<String, Vec<ServiceDto>>) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| KeelError::Io(format!("create {}: {e}", parent.display())))?;
        }
    }
    let json = serde_json::to_vec_pretty(overlay)
        .map_err(|e| KeelError::Io(format!("serialize additions: {e}")))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json).map_err(|e| KeelError::Io(format!("write {}: {e}", tmp.display())))?;
    fs::rename(&tmp, path)
        .map_err(|e| KeelError::Io(format!("rename into {}: {e}", path.display())))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn svc(dir: &str) -> ServiceDto {
        ServiceDto {
            dir: dir.to_owned(),
            service_type: "api".to_owned(),
            lang: "python".to_owned(),
            name: "Backend API".to_owned(),
        }
    }

    #[test]
    fn load_missing_is_empty() {
        let td = TempDir::new().unwrap();
        let store = AdditionsStore::new(td.path().join("nope").join(ADDITIONS_FILE));
        assert!(store.load().unwrap().is_empty());
        assert!(store.for_project("RMB-EN-042").is_empty());
    }

    #[test]
    fn append_roundtrips_and_creates_parents() {
        let td = TempDir::new().unwrap();
        let store = AdditionsStore::new(td.path().join("deep").join(ADDITIONS_FILE));
        store.append("RMB-EN-042", svc("ingest")).unwrap();
        store.append("RMB-EN-042", svc("portal")).unwrap();
        store.append("other", svc("api-2")).unwrap();

        let dirs: Vec<String> = store
            .for_project("RMB-EN-042")
            .into_iter()
            .map(|s| s.dir)
            .collect();
        assert_eq!(dirs, vec!["ingest", "portal"], "appended in order");
        assert_eq!(store.for_project("other").len(), 1);
        assert!(store.for_project("unknown").is_empty());

        // A FRESH store handle over the same path sees the same data (restart survival).
        let fresh = AdditionsStore::new(td.path().join("deep").join(ADDITIONS_FILE));
        assert_eq!(fresh.for_project("RMB-EN-042").len(), 2);
    }

    #[test]
    fn corrupt_overlay_is_an_error_from_load_but_empty_from_for_project() {
        let td = TempDir::new().unwrap();
        let path = td.path().join(ADDITIONS_FILE);
        std::fs::write(&path, b"{ not json").unwrap();
        let store = AdditionsStore::new(path);
        assert!(store.load().is_err());
        assert!(store.for_project("x").is_empty(), "degrades to empty");
    }
}
