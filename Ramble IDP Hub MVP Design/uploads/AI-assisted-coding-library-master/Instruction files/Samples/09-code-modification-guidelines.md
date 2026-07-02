# Code Modification Guidelines

## Before Making Changes

- **Search for existing methods/patterns** before adding new ones.
- **Understand existing structure** - analyze current file/codebase before modifying.
- **Follow existing patterns** - use same patterns as existing code, don't reinvent functionality.
- **Check for similar functionality** - avoid duplicate code.

## Preserve Existing Code

- **Preserve existing code** unless explicitly instructed to remove/change it.
- **Append or modify with care** - don't disrupt existing functionality.
- **Minimal changes** - make changes necessary and well-documented.
- **Don't remove unused code** just for linter errors (fix only: type errors, syntax errors, bugs, performance issues, security vulnerabilities).

## Incremental Changes

- **Test fixes in isolation** before applying broadly.
- **Implement one small piece at a time**, test it, then proceed.
- **Never apply a fix to multiple locations** without first testing it in one location.

## Edge Cases

- **Always handle nil/empty cases** and optional relationships.
- **Handle edge cases** before implementing happy path.

## Simplicity

- **Use simplest solution** - prefer simple solutions, don't over-engineer.
- **Avoid premature optimization** - write clear, correct code first.

## Validation

- **Validate data at save time**, not just at usage time.
- **Check route conflicts** - specific routes before generic ones.
- **Check for dynamic loading/AJAX patterns** when modifying frontend code.

## Checklist

- [ ] Searched for existing methods/patterns
- [ ] Understood existing structure
- [ ] Followed existing patterns
- [ ] Preserved existing code (unless explicitly instructed)
- [ ] Tested fix in isolation before applying broadly
- [ ] Handled edge cases (nil/empty, optional relationships)
- [ ] Used simplest solution
- [ ] Validated data at save time
