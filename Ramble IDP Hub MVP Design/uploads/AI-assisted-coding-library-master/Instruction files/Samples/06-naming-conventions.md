# Naming Conventions

## General

- Use descriptive names that express intent.
- Avoid abbreviations unless widely understood.
- Be consistent with project conventions.
- Use domain terminology when appropriate.

## By Type

- **Variables**: `camelCase`/`snake_case` (nouns): `userName`, `orderTotal`, `isActive`
- **Functions**: `camelCase` (verbs): `calculateTotal()`, `getUserById()`, `validateInput()`
- **Classes/Types**: `PascalCase` (nouns): `UserAccount`, `PaymentProcessor`
- **Constants**: `UPPER_SNAKE_CASE`: `MAX_RETRY_ATTEMPTS`, `DEFAULT_TIMEOUT_MS`
- **Directories**: `kebab-case`: `user-profile/`, `api-client/`
- **Files**: `camelCase`/`PascalCase` (match project style)
- **Database**: `snake_case` (tables plural, columns singular): `users`, `user_id`
- **API Endpoints**: RESTful conventions, `kebab-case`/`camelCase`
- **Env Variables**: `UPPER_SNAKE_CASE`: `DATABASE_URL`, `API_KEY`

## Anti-patterns

❌ Avoid: `x`, `usr`, `temp`, `getData()` (when it saves), `user1`
✅ Prefer: `userName`, `calculateTotalPrice()`, `invoice`
