# Testing Requirements

## Mandatory

- **ALWAYS remind user to create tests** when suggesting new functionality.
- Write tests before or alongside implementation (TDD/BDD preferred).
- Test happy paths, error scenarios, edge cases, and integration points.

## Test Structure

- Follow AAA pattern (Arrange, Act, Assert).
- Use descriptive test names.
- Group related tests logically.

## Test Types

- Unit tests: Individual functions/methods
- Integration tests: Component interactions
- E2E tests: Complete workflows
- Regression tests: Existing functionality

## Test Data

- Use fixtures/factories for consistent data.
- Mock/stub external dependencies.
- Clean up test data after tests.

## Reminder Prompt

When suggesting code, include:
> **💡 Remember to write tests!** Consider: happy paths, error cases, edge conditions, boundary values, integration points.
