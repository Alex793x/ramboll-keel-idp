# Security Best Practices

## Checklist

When implementing features, ensure:
- [ ] Input validation and sanitization (client + server-side)
- [ ] Authentication/authorization checks
- [ ] Sensitive data encrypted (at rest and in transit)
- [ ] SQL injection prevention (parameterized queries/ORM)
- [ ] XSS prevention (escape output, CSP headers)
- [ ] CSRF protection (tokens, SameSite cookies)
- [ ] Secure error handling (no sensitive info exposed)
- [ ] Secrets not exposed in code (use env vars)
- [ ] Dependencies up-to-date and scanned for vulnerabilities

## Key Reminders

- **Never trust user input** - always validate and sanitize.
- **Never store passwords in plain text** - use secure hashing.
- **Never commit secrets** - use environment variables.
- **Use HTTPS/TLS** for all network communications.
- **Follow principle of least privilege** - minimum necessary permissions.
