# Error Handling Standards

## Principles

- Handle errors explicitly - never silently ignore.
- Fail fast - detect errors early.
- Provide meaningful error messages.
- Log errors with context.

## Error Messages

- **Users**: Clear, user-friendly, actionable (no technical jargon or sensitive info).
- **Developers**: Detailed logs with context (stack traces, request data, timestamps).

## Patterns

- Try-catch blocks with appropriate error types.
- Early returns/guard clauses.
- Result objects for recoverable errors.

## API Errors

- Use appropriate HTTP status codes (400, 401, 403, 404, 500).
- Return consistent error response format.
- Include error code, message, and details.

## Logging

- Log at appropriate levels (ERROR, FATAL, WARN).
- Include contextual information.
- Don't log sensitive data.

## Recovery

- Implement retry logic for transient failures.
- Use circuit breakers for external services.
- Provide fallback behavior when appropriate.

## Edge Cases

- **Always handle nil/empty cases** and optional relationships.
- **Handle edge cases** before implementing happy path.
- **Validate data at save time**, not just at usage time.

## Checklist

- [ ] All errors caught and handled
- [ ] User-friendly error messages
- [ ] Detailed errors logged
- [ ] Sensitive info not exposed
- [ ] Appropriate error types used
- [ ] HTTP status codes correct (APIs)
- [ ] Consistent error response format
- [ ] Retry logic for transient failures
