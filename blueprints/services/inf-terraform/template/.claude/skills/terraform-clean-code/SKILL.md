---
name: terraform-clean-code
description: >-
  Strict Terraform maintainability standard for this repo. Use whenever writing
  or refactoring Terraform here. Derive names from the naming local, merge the
  default tags everywhere, pin providers, validate variables, keep resources
  small and composable, and never touch state by hand. Code must pass
  terraform fmt -check and terraform validate clean.
---

# Terraform clean code

Infrastructure is code: small, explicit, reviewed, and tool-clean. **Explicit
over implicit.**

## Naming & tagging (the platform conventions)

- Derive **every** resource name from `local.name_prefix`
  (`<project>-<environment>`), with the standard Azure type prefix
  (`rg-`, `st-`, `kv-`, ...). Never hand-name a resource.
- Merge `local.default_tags` into every taggable resource:
  `tags = merge(local.default_tags, var.tags)`. Tags are how the platform
  attributes cost and ownership — untagged resources are defects.

## Structure

- `main.tf` — provider requirements + locals + resources (split into
  purpose-named files, e.g. `network.tf`, when it grows).
- `variables.tf` — inputs, each with `description`, `type`, and a `validation`
  block when the domain is constrained.
- `outputs.tf` — the stack's public surface, each with a `description`.
- Pin the provider (`~> 4.0`) and the Terraform version (`>= 1.7.0`); commit
  `.terraform.lock.hcl` once it exists.

## Variables & invariants

- Constrain inputs in code, not in tribal knowledge:

```hcl
variable "environment" {
  description = "Deployment environment (matches the platform branch model)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}
```

- No magic strings in resources — thread values through `var`/`local`.
- See the `infra-invariants` skill for turning stack guarantees into
  validations and checks.

## State discipline

- State lives in the remote backend only — never commit it, never edit it by
  hand, never `terraform import`/`state mv` without a reviewed plan.
- One state key per environment; promote dev → staging → prod, matching the
  branch model.

## The tooling gate (non-negotiable)

```bash
terraform fmt -check -recursive   # canonical formatting (fix: terraform fmt)
terraform init -backend=false     # provider resolution, offline
terraform validate                # schema + reference validation
```

## Checklist before opening a PR

- [ ] Names derive from `local.name_prefix`; tags merge `local.default_tags`.
- [ ] New variables have descriptions, types, and validations where constrained.
- [ ] Providers/versions pinned; lock file committed.
- [ ] `terraform fmt -check` and `terraform validate` are clean.
- [ ] The plan output was reviewed — no surprise destroys.
