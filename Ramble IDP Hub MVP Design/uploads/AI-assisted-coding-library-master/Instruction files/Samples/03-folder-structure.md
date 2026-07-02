# Folder Structure Guidelines

## Principles

- Organize by feature/domain when appropriate.
- Keep related files together.
- Use consistent naming conventions.
- Separate concerns (business logic, data access, presentation).

## Common Patterns

- **Feature-based**: `features/auth/components/`, `features/dashboard/services/`
- **Layered**: `controllers/`, `models/`, `views/`, `services/`
- **Hybrid**: `components/`, `features/`, `services/`, `utils/`

## File Organization

- One main class/component per file.
- Group related files in same directory.
- Use index files for simplified imports.
- Keep config in dedicated `config/` directory.
- Separate test files (co-located or `tests/` directory).

## Naming

- Directories: `kebab-case` (`user-profile/`)
- Files: `camelCase` or `PascalCase` (follow project conventions)
- Be consistent with existing project style.

## Best Practices

- Avoid deep nesting (max 3-4 levels).
- Keep root directory clean.
- Document structure if complex.
