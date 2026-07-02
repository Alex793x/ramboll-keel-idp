# Code Quality Standards

## Constants and Magic Numbers

- **NEVER use magic numbers or hardcoded strings** - always define constants.
- Extract all magic numbers, strings, and config values into named constants.

❌ `if (age > 18)` → ✅ `if (age > MINIMUM_AGE)`

## Code Organization

- Keep functions small and focused (single responsibility).
- Avoid deep nesting - use early returns/guard clauses.
- Use descriptive names that express intent.
- Extract complex logic into separate functions.

## Comments

- Write self-documenting code.
- When needed, explain **why**, not **what**.
- Keep comments up-to-date.

## Error Handling

- Handle errors explicitly - never silently ignore.
- Provide meaningful error messages.
- Use appropriate error types.
- Log errors with context.

## Performance

- Avoid premature optimization.
- Be mindful of performance-critical sections.
- Profile before optimizing.

## Code Modification

- **Search for existing methods/patterns** before adding new ones.
- **Follow existing patterns** - don't reinvent functionality.
- **Preserve existing code** unless explicitly instructed to change.
- **Don't remove unused code** just for linter errors (fix only: type errors, syntax errors, bugs, performance issues, security vulnerabilities).
- **Test fixes in isolation** before applying broadly.
- **Handle edge cases** - nil/empty cases and optional relationships.
- **Use simplest solution** - don't over-engineer.
