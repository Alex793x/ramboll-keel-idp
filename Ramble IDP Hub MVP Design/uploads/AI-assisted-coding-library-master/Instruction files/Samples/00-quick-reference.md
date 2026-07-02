# Quick Reference Guide

## Essential Rules (Always Apply)

### 1. No Magic Numbers
❌ `if (age > 18)` → ✅ `if (age > MINIMUM_AGE)`

### 2. Always Write Tests
💡 **Remind users to write tests** for every new feature or significant change.

### 3. Use Ramboll Brand Colors & Visual Elements
❌ `color: #0098eb` → ✅ `color: var(--ramboll-cyan)` or `RAMBOLL_COLORS.cyan`
- Primary: **Cyan** `#0098eb` + **White** `#ffffff` (always use together)
- Secondary: Ocean, Forest, Heath, Mountain, Grass, Pebble (use with primary colors)
- Spot: Field, Sand (CTAs only, sparingly)
- Font: **Nunito** (never hardcode font names)
- Icons: **Feather icons** (monoline, rounded ends)
- Pictograms/Illustrations: Use from Ramboll libraries, cyan outlines

### 4. Descriptive Names
❌ `calc()` → ✅ `calculateTotalPrice()`

### 5. Handle Errors Explicitly
❌ Silent failures → ✅ Try-catch with meaningful error messages

### 6. Validate Input
✅ Always validate and sanitize user input (client + server-side)

### 7. Security First
✅ Never commit secrets, use parameterized queries, escape output

### 8. Check Before Coding
✅ Search for existing methods/patterns before adding new ones
✅ Follow existing patterns, don't reinvent functionality
✅ Test fixes in isolation before applying broadly

## Quick Checklist

Before submitting code:
- [ ] No magic numbers (use constants)
- [ ] Tests written and passing
- [ ] Colors use design tokens
- [ ] Descriptive variable/function names
- [ ] Errors handled explicitly
- [ ] Input validated
- [ ] Security considerations addressed
- [ ] Code follows project structure
- [ ] Searched for existing patterns before coding
- [ ] Preserved existing code (unless explicitly instructed)

## File Reference

For detailed guidelines, see:
- **Code Quality**: `01-code-quality.md`
- **Testing**: `02-testing-requirements.md`
- **Structure**: `03-folder-structure.md`
- **Branding**: `04-branding-design-system.md`
- **Security**: `05-security-best-practices.md`
- **Naming**: `06-naming-conventions.md`
- **Errors**: `07-error-handling.md`
- **Review**: `08-code-review-checklist.md`
- **Modification**: `09-code-modification-guidelines.md`
