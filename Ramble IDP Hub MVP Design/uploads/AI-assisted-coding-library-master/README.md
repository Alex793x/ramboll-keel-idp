# AI-Assisted Coding Library

A shared library of reusable instruction files and guidelines designed to help teams get the most out of AI coding assistants such as GitHub Copilot, Claude code and Cursor.

---

## Purpose

AI coding assistants produce better results when they are given clear, consistent context about a team's expectations. This library centralises that context in a set of well-structured instruction files so that:

- Teams can adopt proven standards without starting from scratch.
- Guidelines stay consistent across multiple projects and repositories.
- New team members can quickly understand the conventions being followed.
- Files can be customised for project-specific needs without losing the common baseline.

---

## Repository Structure

```
AI-assisted-coding-library/
└── Instruction files/
    └── Samples/          # Ready-to-use sample instruction files
        ├── 00-quick-reference.md
        ├── 01-code-quality.md
        ├── 02-testing-requirements.md
        ├── 03-folder-structure.md
        ├── 04-branding-design-system.md
        ├── 05-security-best-practices.md
        ├── 06-naming-conventions.md
        ├── 07-error-handling.md
        ├── 08-code-review-checklist.md
        └── 09-code-modification-guidelines.md
```

### Sample Files Overview

| File | Description |
|------|-------------|
| `00-quick-reference.md` | A concise summary of the most important rules – a great single file to attach to any Copilot chat session. |
| `01-code-quality.md` | Standards for code quality, the use of constants over magic numbers, and general code organisation. |
| `02-testing-requirements.md` | Testing requirements and best practices to ensure every change is properly covered. |
| `03-folder-structure.md` | Recommended folder structure and organisation patterns. |
| `04-branding-design-system.md` | Branding colours, design tokens, typography, and UI component standards. |
| `05-security-best-practices.md` | Security checklist covering input validation, authentication, secrets management, and data protection. |
| `06-naming-conventions.md` | Naming conventions for variables, functions, classes, files, and more. |
| `07-error-handling.md` | Patterns and standards for explicit, meaningful error handling. |
| `08-code-review-checklist.md` | A pre-submission checklist to use before raising a pull request. |
| `09-code-modification-guidelines.md` | Guidelines for modifying existing code while preserving behaviour and following established patterns. |

---

## How to Use

### Option 1 – Reference files in GitHub Copilot Chat

Attach one or more files from this library when starting a Copilot Chat session, or reference them directly in your prompts:

```
Follow the guidelines in `01-code-quality.md` when refactoring this module.
Write tests as described in `02-testing-requirements.md`.
```

### Option 2 – Copy into your project

1. Copy the files you need into your project's `.github/copilot-instructions/` directory (or any location your team agrees on).
2. Customise the content for your project's specific needs, languages, and conventions.
3. Commit the files so every contributor benefits from the same guidance automatically.

### Option 3 – Reference from a central instructions file

Include a reference to the relevant files from your project's main `copilot-instructions.md`:

```markdown
See `.github/copilot-instructions/` for detailed guidelines on:
- Code quality standards (`01-code-quality.md`)
- Testing requirements (`02-testing-requirements.md`)
- Security best practices (`05-security-best-practices.md`)
```
