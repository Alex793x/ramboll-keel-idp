//! JSON-file catalog persistence for [`InitOutcome`] rows.
//!
//! The catalog is a single JSON array of [`InitOutcome`] objects (no DB infra in the MVP, per
//! SPEC §D-04). It is the durable record `list_projects` reads and the upsert target of the
//! `register` step. Upsert is keyed on `catalog_id`, which is stable per `(owner, name)` — so
//! re-running initialization for an existing repo **replaces** its row instead of appending a
//! duplicate, preserving idempotency.

use std::fs;
use std::path::Path;

use keel_core::{InitOutcome, KeelError, Result};

/// Read + parse the catalog. Returns an empty vec if the file does not exist yet.
///
/// # Errors
/// [`KeelError::Io`] if the file exists but cannot be read or parsed.
pub(crate) fn read(path: &Path) -> Result<Vec<InitOutcome>> {
    match fs::read(path) {
        Ok(bytes) => {
            if bytes.iter().all(u8::is_ascii_whitespace) {
                // An empty (or whitespace-only) file is treated as an empty catalog.
                return Ok(Vec::new());
            }
            serde_json::from_slice(&bytes)
                .map_err(|e| KeelError::Io(format!("parse catalog {}: {e}", path.display())))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(KeelError::Io(format!(
            "read catalog {}: {e}",
            path.display()
        ))),
    }
}

/// Atomically write the catalog, creating parent directories as needed.
///
/// Writes to a sibling temp file then renames, so a crash mid-write never corrupts the catalog.
///
/// # Errors
/// [`KeelError::Io`] on any filesystem failure.
fn write(path: &Path, rows: &[InitOutcome]) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| KeelError::Io(format!("create {}: {e}", parent.display())))?;
        }
    }
    let json = serde_json::to_vec_pretty(rows)
        .map_err(|e| KeelError::Io(format!("serialize catalog: {e}")))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json).map_err(|e| KeelError::Io(format!("write {}: {e}", tmp.display())))?;
    fs::rename(&tmp, path)
        .map_err(|e| KeelError::Io(format!("rename into {}: {e}", path.display())))?;
    Ok(())
}

/// Insert or replace `outcome` in the catalog at `path`, keyed by `catalog_id`.
///
/// Returns the full catalog after the upsert.
///
/// # Errors
/// [`KeelError::Io`] on read/write failure.
pub(crate) fn upsert(path: &Path, outcome: &InitOutcome) -> Result<Vec<InitOutcome>> {
    let mut rows = read(path)?;
    match rows.iter_mut().find(|r| r.catalog_id == outcome.catalog_id) {
        Some(existing) => *existing = outcome.clone(),
        None => rows.push(outcome.clone()),
    }
    write(path, &rows)?;
    Ok(rows)
}

/// A stable catalog id derived from `owner/name`. Deterministic so re-running keys the same row.
#[must_use]
pub(crate) fn catalog_id(owner: &str, name: &str) -> String {
    // FNV-1a over the canonical "owner/name" key → stable, collision-resistant enough for a
    // single-tenant MVP catalog, and free of external deps.
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    let key = format!("{owner}/{name}");
    let mut hash = OFFSET;
    for b in key.as_bytes() {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(PRIME);
    }
    format!("cat_{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use keel_core::RepoCoordinates;
    use tempfile::TempDir;

    fn outcome(owner: &str, name: &str) -> InitOutcome {
        InitOutcome {
            project: name.into(),
            repo: RepoCoordinates {
                owner: owner.into(),
                name: name.into(),
                html_url: format!("https://github.com/{owner}/{name}"),
                default_branch: "main".into(),
                branches: vec!["main".into()],
            },
            docs_path: format!("{name}/docs"),
            blueprint_version: "1.0.0".into(),
            catalog_id: catalog_id(owner, name),
            events: Vec::new(),
        }
    }

    #[test]
    fn read_missing_is_empty() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("nope").join("catalog.json");
        assert!(read(&path).unwrap().is_empty());
    }

    #[test]
    fn upsert_creates_parent_dirs_and_roundtrips() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("deep").join("nested").join("catalog.json");
        let rows = upsert(&path, &outcome("o", "alpha")).unwrap();
        assert_eq!(rows.len(), 1);
        let back = read(&path).unwrap();
        assert_eq!(back, rows);
    }

    #[test]
    fn upsert_replaces_same_id_no_duplicate() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("catalog.json");
        upsert(&path, &outcome("o", "alpha")).unwrap();
        let mut second = outcome("o", "alpha");
        second.blueprint_version = "2.0.0".into();
        let rows = upsert(&path, &second).unwrap();
        assert_eq!(rows.len(), 1, "same catalog_id must not duplicate");
        assert_eq!(rows[0].blueprint_version, "2.0.0");
    }

    #[test]
    fn upsert_appends_distinct_ids() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("catalog.json");
        upsert(&path, &outcome("o", "alpha")).unwrap();
        let rows = upsert(&path, &outcome("o", "beta")).unwrap();
        assert_eq!(rows.len(), 2);
    }

    #[test]
    fn catalog_id_is_stable_and_distinct() {
        assert_eq!(catalog_id("o", "alpha"), catalog_id("o", "alpha"));
        assert_ne!(catalog_id("o", "alpha"), catalog_id("o", "beta"));
        assert_ne!(catalog_id("a", "x"), catalog_id("b", "x"));
    }
}
