/**
 * Pure project-name validation — the hub mirror of keel-core's
 * `is_valid_project_name` / `PROJECT_NAME_PATTERN` (SPEC §3.1).
 *
 * Kept dependency-free and side-effect-free so it can be exhaustively
 * property-tested (Vitest + fast-check).
 */

/** Canonical regex for project names (SPEC §3.1: `^[a-z][a-z0-9-]{2,40}$`). */
export const PROJECT_NAME_PATTERN = /^[a-z][a-z0-9-]{2,40}$/;

/** Human-readable hint shown beneath the project-name field. */
export const PROJECT_NAME_HINT =
  "Lowercase letters, digits and hyphens; start with a letter; 3–41 characters.";

/**
 * Returns true iff `name` matches the frozen project-name rule.
 *
 * Implemented without the regex (character-by-character) so behaviour is
 * transparent and identical to the Rust side; the regex above documents intent
 * and is used by a unit test as a cross-check.
 */
export function validateProjectName(name: string): boolean {
  const len = name.length;
  // First char + 2..40 more = total length 3..41.
  if (len < 3 || len > 41) {
    return false;
  }
  const first = name.charCodeAt(0);
  // 'a'..'z'
  if (first < 97 || first > 122) {
    return false;
  }
  for (let i = 1; i < len; i += 1) {
    const c = name.charCodeAt(i);
    const isLower = c >= 97 && c <= 122;
    const isDigit = c >= 48 && c <= 57;
    const isDash = c === 45; // '-'
    if (!isLower && !isDigit && !isDash) {
      return false;
    }
  }
  return true;
}
