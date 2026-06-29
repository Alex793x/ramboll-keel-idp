//! The MiniJinja renderer for the blueprint `template/` tree.
//!
//! **Frozen rules:**
//! 1. Every path segment has `{{ … }}` interpolated **always**.
//! 2. A file whose name ends in the rename suffix (`.j2`) has its **contents** rendered through
//!    MiniJinja, and the suffix is stripped from the destination name.
//! 3. Every other file is copied **verbatim** (raw bytes) so GitHub Actions `${{ … }}` survives.
//! 4. `template.conditions` include/exclude listed `paths` based on a `when` expression; the paths
//!    are matched against the **rendered destination path**.

use std::path::{Path, PathBuf};

use keel_core::{InitRequest, KeelError, RenderedFile, Result};
use minijinja::{Environment, Value as JinjaValue};

use crate::{context::derive_context, Condition, Manifest};

/// Render the whole template tree into an in-memory, repo-relative file set.
pub(crate) fn render(
    manifest: &Manifest,
    blueprint_dir: &Path,
    req: &InitRequest,
) -> Result<Vec<RenderedFile>> {
    let ctx_map = derive_context(req);
    let ctx = JinjaValue::from_serialize(&ctx_map);

    let mut env = Environment::new();
    // Jinja2 defaults `keep_trailing_newline=True`; MiniJinja defaults it to False and would strip
    // the final newline of every rendered file, tripping `ruff`/`black` (W292) in the generated
    // repo. Preserve it so rendered files are POSIX-clean and green from birth.
    env.set_keep_trailing_newline(true);

    let root = blueprint_dir.join(&manifest.template.root);
    if !root.is_dir() {
        return Err(KeelError::Render(format!(
            "template root {} does not exist or is not a directory",
            root.display()
        )));
    }

    let rename = &manifest.template.rename;
    let mut files: Vec<(PathBuf, PathBuf)> = Vec::new();
    collect_files(&root, &root, &mut files)?;
    // Deterministic order so the output is stable across runs and platforms.
    files.sort();

    let mut out = Vec::with_capacity(files.len());
    for (abs, rel) in files {
        let dest = render_dest_path(&env, &ctx, &rel, rename)?;
        let dest_str = dest_to_string(&dest)?;

        if !path_included(&env, &ctx, &dest_str, &manifest.template.conditions)? {
            continue;
        }

        let is_template = is_template_file(&rel, rename);
        let contents = if is_template {
            let raw = std::fs::read_to_string(&abs).map_err(|e| {
                KeelError::Render(format!("reading template {}: {e}", abs.display()))
            })?;
            let rendered = env
                .render_named_str(&dest_str, &raw, &ctx)
                .map_err(|e| KeelError::Render(format!("rendering {}: {e}", abs.display())))?;
            rendered.into_bytes()
        } else {
            std::fs::read(&abs)
                .map_err(|e| KeelError::Render(format!("reading {}: {e}", abs.display())))?
        };

        out.push(RenderedFile {
            path: dest_str,
            contents,
        });
    }

    Ok(out)
}

/// Recursively collect `(absolute, relative-to-root)` paths of every regular file under `dir`.
fn collect_files(root: &Path, dir: &Path, acc: &mut Vec<(PathBuf, PathBuf)>) -> Result<()> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| KeelError::Render(format!("reading dir {}: {e}", dir.display())))?;
    for entry in entries {
        let entry = entry.map_err(|e| KeelError::Render(format!("dir entry: {e}")))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| KeelError::Render(format!("file type of {}: {e}", path.display())))?;
        if file_type.is_dir() {
            collect_files(root, &path, acc)?;
        } else if file_type.is_file() {
            let rel = path
                .strip_prefix(root)
                .map_err(|e| KeelError::Render(format!("strip prefix: {e}")))?
                .to_path_buf();
            acc.push((path, rel));
        }
        // Symlinks and other entry kinds are ignored.
    }
    Ok(())
}

/// Interpolate `{{ … }}` in every segment of the relative path and strip the rename suffix from
/// the final segment when present.
fn render_dest_path(
    env: &Environment,
    ctx: &JinjaValue,
    rel: &Path,
    rename: &str,
) -> Result<PathBuf> {
    let mut dest = PathBuf::new();
    for component in rel.components() {
        let seg = component.as_os_str().to_string_lossy();
        let rendered_seg = env
            .render_named_str("<path-segment>", &seg, ctx)
            .map_err(|e| KeelError::Render(format!("interpolating path segment {seg:?}: {e}")))?;
        dest.push(rendered_seg);
    }

    // Strip the rename suffix from the final segment only.
    if let Some(name) = dest.file_name().map(|s| s.to_string_lossy().into_owned()) {
        if let Some(stripped) = name.strip_suffix(rename) {
            dest.set_file_name(stripped);
        }
    }
    Ok(dest)
}

/// True when the source file's name ends in the rename suffix (contents should be rendered).
fn is_template_file(rel: &Path, rename: &str) -> bool {
    rel.file_name()
        .map(|n| n.to_string_lossy().ends_with(rename))
        .unwrap_or(false)
}

/// Normalize a destination path to a forward-slash, repo-relative string.
fn dest_to_string(dest: &Path) -> Result<String> {
    let mut parts = Vec::new();
    for component in dest.components() {
        parts.push(component.as_os_str().to_string_lossy().into_owned());
    }
    if parts.is_empty() {
        return Err(KeelError::Render("empty destination path".into()));
    }
    Ok(parts.join("/"))
}

/// Decide whether a rendered destination path is included given the condition rules.
///
/// Semantics: a condition `{when, paths}` governs exactly the listed `paths`. If a destination is
/// listed by *some* condition, it is included **iff at least one** of the conditions listing it has
/// a truthy `when`. Destinations listed by no condition are always included.
fn path_included(
    env: &Environment,
    ctx: &JinjaValue,
    dest: &str,
    conditions: &[Condition],
) -> Result<bool> {
    let mut governed = false;
    let mut allowed = false;

    for cond in conditions {
        // A condition's `paths` are themselves interpolated so authors can write
        // `src/{{ package_name }}/api.py` and have it match the rendered destination.
        for raw_path in &cond.paths {
            let rendered_path = env
                .render_named_str("<condition-path>", raw_path, ctx)
                .map_err(|e| {
                    KeelError::Render(format!("interpolating condition path {raw_path:?}: {e}"))
                })?;
            if normalize_slashes(&rendered_path) == dest {
                governed = true;
                if eval_when(env, ctx, &cond.when)? {
                    allowed = true;
                }
            }
        }
    }

    Ok(!governed || allowed)
}

/// Evaluate a `when` expression as a MiniJinja boolean.
fn eval_when(env: &Environment, ctx: &JinjaValue, when: &str) -> Result<bool> {
    if when.trim().is_empty() {
        return Ok(true);
    }
    // Render `{{ (expr) }}` and interpret the textual result as a boolean.
    let probe = format!("{{{{ ({when}) }}}}");
    let rendered = env
        .render_named_str("<when>", &probe, ctx)
        .map_err(|e| KeelError::Render(format!("evaluating when {when:?}: {e}")))?;
    Ok(is_truthy(rendered.trim()))
}

fn is_truthy(s: &str) -> bool {
    !matches!(s, "" | "false" | "False" | "0" | "none" | "None")
}

fn normalize_slashes(p: &str) -> String {
    p.replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use keel_core::{Department, ServiceKind, User};
    use std::fs;
    use tempfile::TempDir;

    /// A literal GitHub Actions expression that must survive verbatim copying.
    const VERBATIM_WORKFLOW: &str = "jobs:\n  x:\n    run: echo ${{ matrix.x }}\n";

    fn manifest_with(conditions: Vec<Condition>) -> Manifest {
        Manifest {
            template: crate::TemplateSpec {
                root: "template".into(),
                rename: ".j2".into(),
                conditions,
            },
            ..Manifest::default()
        }
    }

    fn request(kind: ServiceKind) -> InitRequest {
        InitRequest {
            project_name: "invoicing-api".into(),
            blueprint: "python-service".into(),
            department: Department {
                id: "d1".into(),
                name: "Buildings".into(),
                team_slug: "buildings".into(),
            },
            users: vec![User {
                id: "u1".into(),
                name: "Ada".into(),
                email: "ada@ramboll.com".into(),
                github_login: "ada-gh".into(),
            }],
            service_kind: kind,
            description: "Handles invoices.".into(),
            author: "Ada".into(),
        }
    }

    /// Build a hermetic template dir. Returns the blueprint dir (whose `template/` holds the tree).
    fn hermetic_template() -> TempDir {
        let dir = TempDir::new().unwrap();
        let tpl = dir.path().join("template");
        fs::create_dir_all(tpl.join("src/{{ package_name }}")).unwrap();
        fs::create_dir_all(tpl.join(".github/workflows")).unwrap();

        // 1. Verbatim file containing a literal `${{ matrix.x }}`.
        fs::write(tpl.join(".github/workflows/build.yml"), VERBATIM_WORKFLOW).unwrap();
        // 2. A .j2 file: contents rendered, suffix stripped.
        fs::write(
            tpl.join("src/{{ package_name }}/core.py.j2"),
            "# {{ project_name }} owned by {{ department.team_slug }}\n",
        )
        .unwrap();
        // 3. A plain (non-.j2) file with `{{ }}` in the NAME but raw contents.
        fs::write(
            tpl.join("src/{{ package_name }}/__init__.py"),
            "VERSION = '0.1.0'\n",
        )
        .unwrap();
        // 4. A conditional file (only when rest-api).
        fs::write(
            tpl.join("src/{{ package_name }}/api.py.j2"),
            "# api for {{ project_name }}\n",
        )
        .unwrap();

        dir
    }

    fn find<'a>(files: &'a [RenderedFile], path: &str) -> Option<&'a RenderedFile> {
        files.iter().find(|f| f.path == path)
    }

    #[test]
    fn verbatim_file_is_byte_identical_including_gh_expr() {
        let dir = hermetic_template();
        let m = manifest_with(vec![]);
        let files = render(&m, dir.path(), &request(ServiceKind::RestApi)).unwrap();
        let f = find(&files, ".github/workflows/build.yml").expect("workflow present");
        assert_eq!(f.contents, VERBATIM_WORKFLOW.as_bytes());
        assert!(String::from_utf8_lossy(&f.contents).contains("${{ matrix.x }}"));
    }

    #[test]
    fn j2_files_are_rendered_and_suffix_stripped() {
        let dir = hermetic_template();
        let m = manifest_with(vec![]);
        let files = render(&m, dir.path(), &request(ServiceKind::RestApi)).unwrap();
        // Path interpolated, .j2 stripped.
        let core = find(&files, "src/invoicing_api/core.py").expect("core.py present");
        let text = String::from_utf8_lossy(&core.contents);
        assert!(text.contains("invoicing-api"));
        assert!(text.contains("buildings"));
        assert!(!text.contains("{{"));
        // No .j2 file should leak through.
        assert!(files.iter().all(|f| !f.path.ends_with(".j2")));
    }

    #[test]
    fn plain_file_with_template_name_keeps_raw_contents() {
        let dir = hermetic_template();
        let m = manifest_with(vec![]);
        let files = render(&m, dir.path(), &request(ServiceKind::RestApi)).unwrap();
        let init = find(&files, "src/invoicing_api/__init__.py").expect("__init__ present");
        assert_eq!(init.contents, b"VERSION = '0.1.0'\n");
    }

    #[test]
    fn condition_includes_path_when_true() {
        let dir = hermetic_template();
        let m = manifest_with(vec![Condition {
            when: "service_kind == 'rest-api'".into(),
            paths: vec!["src/{{ package_name }}/api.py".into()],
        }]);
        let files = render(&m, dir.path(), &request(ServiceKind::RestApi)).unwrap();
        assert!(find(&files, "src/invoicing_api/api.py").is_some());
    }

    #[test]
    fn condition_excludes_path_when_false() {
        let dir = hermetic_template();
        let m = manifest_with(vec![Condition {
            when: "service_kind == 'rest-api'".into(),
            paths: vec!["src/{{ package_name }}/api.py".into()],
        }]);
        let files = render(&m, dir.path(), &request(ServiceKind::Worker)).unwrap();
        assert!(find(&files, "src/invoicing_api/api.py").is_none());
        // Non-conditional files are still present.
        assert!(find(&files, "src/invoicing_api/core.py").is_some());
    }

    proptest::proptest! {
        #[test]
        fn verbatim_bytes_never_change(project in "[a-z][a-z0-9-]{2,20}") {
            let dir = hermetic_template();
            let m = manifest_with(vec![]);
            let mut req = request(ServiceKind::RestApi);
            req.project_name = project;
            let files = render(&m, dir.path(), &req).unwrap();
            let f = find(&files, ".github/workflows/build.yml").unwrap();
            proptest::prop_assert_eq!(&f.contents, &VERBATIM_WORKFLOW.as_bytes().to_vec());
        }

        #[test]
        fn no_j2_suffix_ever_leaks(project in "[a-z][a-z0-9-]{2,20}") {
            let dir = hermetic_template();
            let m = manifest_with(vec![]);
            let mut req = request(ServiceKind::RestApi);
            req.project_name = project.clone();
            let files = render(&m, dir.path(), &req).unwrap();
            let pkg = crate::to_package_name(&project);
            // The package-name segment is interpolated into the path.
            proptest::prop_assert!(files.iter().any(|f| f.path.contains(&pkg)));
            proptest::prop_assert!(files.iter().all(|f| !f.path.ends_with(".j2")));
        }
    }

    #[test]
    fn truthiness_table() {
        assert!(is_truthy("true"));
        assert!(is_truthy("True"));
        assert!(!is_truthy("false"));
        assert!(!is_truthy("False"));
        assert!(!is_truthy(""));
        assert!(!is_truthy("0"));
    }
}
