//! Subprocess + filesystem helpers shared by [`crate::GhCliProvider`] and
//! [`crate::LocalDirProvider`].
//!
//! Everything here is `std`-only (`std::process::Command`, `std::fs`). No async, no extra deps.

use std::ffi::OsStr;
use std::path::Path;
use std::process::{Command, Output};

use keel_core::{KeelError, RenderedFile, Result};

/// Run `program` with `args` in `cwd`, returning trimmed stdout on success.
///
/// On a non-zero exit this maps to [`KeelError::Github`] with the combined stderr/stdout so the
/// caller (and the engine's progress events) get an actionable message.
///
/// # Errors
/// Returns [`KeelError::Io`] if the process cannot be spawned and [`KeelError::Github`] on a
/// non-zero exit status.
pub fn run<I, S>(program: &str, args: I, cwd: &Path) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let out = capture(program, args, cwd)?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_owned())
    } else {
        Err(KeelError::Github(format!(
            "`{program}` exited with {}: {}",
            out.status
                .code()
                .map_or_else(|| "signal".to_owned(), |c| c.to_string()),
            describe(&out)
        )))
    }
}

/// Like [`run`] but returns the raw [`Output`] without judging the exit status, so callers can make
/// their own success/failure decisions (e.g. `gh repo view` for an existence check, or a
/// best-effort branch-protection PUT).
///
/// # Errors
/// Returns [`KeelError::Io`] only if the process cannot be spawned at all.
pub fn capture<I, S>(program: &str, args: I, cwd: &Path) -> Result<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| KeelError::Io(format!("failed to spawn `{program}`: {e}")))
}

/// Human-readable stderr-then-stdout text from a process [`Output`], trimmed.
pub fn describe(out: &Output) -> String {
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stderr = stderr.trim();
    if stderr.is_empty() {
        String::from_utf8_lossy(&out.stdout).trim().to_owned()
    } else {
        stderr.to_owned()
    }
}

/// Write every [`RenderedFile`] under `root`, creating parent directories as needed and writing
/// raw bytes (binary-safe). Paths are interpreted relative to `root`.
///
/// # Errors
/// Returns [`KeelError::Io`] on any filesystem failure.
pub fn write_files(root: &Path, files: &[RenderedFile]) -> Result<()> {
    for f in files {
        let dest = root.join(&f.path);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| KeelError::Io(format!("create_dir_all {}: {e}", parent.display())))?;
        }
        std::fs::write(&dest, &f.contents)
            .map_err(|e| KeelError::Io(format!("write {}: {e}", dest.display())))?;
    }
    Ok(())
}

/// Initialise a git repo at `root` on `default_branch`, stage everything, and create the initial
/// commit with a deterministic identity (so this never depends on the caller's global git config).
///
/// # Errors
/// Returns [`KeelError::Github`] / [`KeelError::Io`] if any git invocation fails.
pub fn git_init_commit(root: &Path, default_branch: &str, commit_message: &str) -> Result<()> {
    run("git", ["init", "-b", default_branch], root)?;
    run(
        "git",
        [
            "-c",
            "user.email=keel@ramboll.com",
            "-c",
            "user.name=Keel",
            "add",
            "-A",
        ],
        root,
    )?;
    run(
        "git",
        [
            "-c",
            "user.email=keel@ramboll.com",
            "-c",
            "user.name=Keel",
            "commit",
            "-m",
            commit_message,
        ],
        root,
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn write_files_creates_nested_dirs_and_bytes() {
        let td = TempDir::new().unwrap();
        let files = vec![
            RenderedFile::text("a/b/c.txt", "deep"),
            RenderedFile {
                path: "bin.dat".into(),
                contents: vec![0u8, 255u8, 1u8],
            },
        ];
        write_files(td.path(), &files).unwrap();
        assert_eq!(
            std::fs::read_to_string(td.path().join("a/b/c.txt")).unwrap(),
            "deep"
        );
        assert_eq!(
            std::fs::read(td.path().join("bin.dat")).unwrap(),
            vec![0u8, 255u8, 1u8]
        );
    }

    #[test]
    fn run_reports_nonzero_exit() {
        let td = TempDir::new().unwrap();
        // `git` with a bogus subcommand exits non-zero; assert we surface a Github error.
        let err = run("git", ["definitely-not-a-subcommand"], td.path()).unwrap_err();
        assert!(matches!(err, KeelError::Github(_)), "got {err:?}");
    }
}
