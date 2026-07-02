# GitHub Copilot Instructions

This directory contains standard instruction files for GitHub Copilot that can be used across **any project** and **any programming language**. These files provide general best practices and coding standards.

## File Structure

1. **[01-code-quality.md](01-code-quality.md)** - Code quality standards, constants, magic numbers, code organization
2. **[02-testing-requirements.md](02-testing-requirements.md)** - Testing requirements and best practices
3. **[03-folder-structure.md](03-folder-structure.md)** - Folder structure guidelines and organization patterns
4. **[04-branding-design-system.md](04-branding-design-system.md)** - Branding colors, design system, UI standards
5. **[05-security-best-practices.md](05-security-best-practices.md)** - Security best practices and checklist
6. **[06-naming-conventions.md](06-naming-conventions.md)** - Naming conventions for variables, functions, classes, etc.
7. **[07-error-handling.md](07-error-handling.md)** - Error handling standards and patterns
8. **[08-code-review-checklist.md](08-code-review-checklist.md)** - Pre-submission checklist for code reviews
9. **[09-code-modification-guidelines.md](09-code-modification-guidelines.md)** - Code modification guidelines, preserving existing code, following patterns

## How to Use

### Option 1: Reference in GitHub Copilot Chat
Reference these files when asking Copilot to follow specific guidelines:
- "Follow the code quality standards in `.github/copilot-instructions/01-code-quality.md`"
- "Remember to write tests as per `.github/copilot-instructions/02-testing-requirements.md`"

### Option 2: Include in Copilot Instructions
Copy relevant sections into your main `copilot-instructions.md` file or reference them:
```markdown
See `.github/copilot-instructions/` for detailed guidelines on:
- Code quality standards
- Testing requirements
- Security best practices
- Naming conventions
```

### Option 3: Project-Specific Customization
1. Copy these files to your project's `.github/copilot-instructions/` directory
2. Customize them for your specific project needs
3. Add project-specific examples and conventions
4. Reference language-specific patterns if needed

## Key Principles Covered

- ✅ **No magic numbers** - Always use constants
- ✅ **Testing requirements** - Always remind to write tests
- ✅ **Branding colors** - Use design system tokens
- ✅ **Folder structure** - Consistent organization patterns
- ✅ **Security** - Input validation, authentication, data protection
- ✅ **Error handling** - Explicit error handling with meaningful messages
- ✅ **Naming conventions** - Descriptive, consistent naming
- ✅ **Code review** - Pre-submission checklist
- ✅ **Code modification** - Preserve existing code, follow patterns, test incrementally

## Customization

These files are designed to be **language-agnostic** and **project-agnostic**. Feel free to:
- Add project-specific examples
- Include language-specific patterns
- Add team-specific conventions
- Reference your design system or brand guidelines
- Include links to your documentation

## Contributing

When adding new instruction files:
1. Use numbered prefixes (e.g., `09-new-topic.md`) for ordering
2. Keep content general and applicable to any project
3. Include examples where helpful
4. Use clear headings and checklists
5. Update this README to include the new file
