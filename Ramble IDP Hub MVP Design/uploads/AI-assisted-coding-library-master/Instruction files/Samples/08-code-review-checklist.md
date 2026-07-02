# Code Review Checklist

## Before Submitting Code

### Functionality
- [ ] Works as intended, meets requirements
- [ ] Edge cases and error scenarios handled
- [ ] No breaking changes (or documented)

### Code Quality
- [ ] No magic numbers/hardcoded values (use constants)
- [ ] Follows project style guide
- [ ] Functions small and focused
- [ ] Descriptive names
- [ ] No code duplication
- [ ] Comments explain "why"
- [ ] Searched for existing patterns before coding
- [ ] Followed existing patterns (didn't reinvent)
- [ ] Preserved existing code (unless explicitly instructed)

### Testing
- [ ] Tests written for new functionality
- [ ] Tests cover happy paths and errors
- [ ] All tests passing
- [ ] No regressions

### Security
- [ ] Input validation/sanitization
- [ ] No sensitive data exposed
- [ ] Authentication/authorization checks
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] Dependencies up-to-date

### Performance
- [ ] No obvious performance issues
- [ ] Database queries optimized
- [ ] Efficient handling of large datasets

### Documentation
- [ ] Self-documenting code
- [ ] Complex logic commented
- [ ] README/docs updated if needed

### Design System / Branding
- [ ] Colors use design tokens (not hardcoded)
- [ ] Typography follows design system
- [ ] Components match existing patterns
- [ ] Accessibility standards met

### Git
- [ ] Meaningful commit messages
- [ ] No commented-out code
- [ ] No sensitive data in commits

## Reminder for AI Assistants

When suggesting code, remind users to:
1. Write tests
2. Review against this checklist
3. Test manually
4. Update documentation if needed
5. Check security implications
