---
name: infra-invariants
description: >-
  Property-based thinking for Terraform: encode stack guarantees as executable
  invariants. Use whenever adding or changing resources, variables, or modules
  in this repo. Express invariants with variable validations, preconditions,
  postconditions, and check blocks so terraform validate/plan enforce them —
  never rely on review alone.
---

# Infra invariants (property-based thinking for Terraform)

There is no Hypothesis for HCL — but the discipline transfers: state the
*properties* the stack guarantees, then encode them so the toolchain enforces
them on every plan. An invariant that only lives in a reviewer's head is not
an invariant.

## The rule

> For every input and every non-trivial resource, state at least one invariant
> and encode it as a `validation`, `precondition`, `postcondition`, or `check`
> block. `terraform validate` (CI: **test**) is the property runner.

## Where invariants live

| Mechanism | Guards | Runs at |
| --- | --- | --- |
| `variable.validation` | input domains | validate |
| `lifecycle.precondition` | assumptions a resource makes | plan |
| `lifecycle.postcondition` | promises a resource keeps | plan/apply |
| `check` block | whole-stack assertions | plan |

## Concrete examples from this stack

- `environment` has a **domain invariant**: one of `dev`/`staging`/`prod`
  (variable validation — mirrors the branch model).
- Every resource name has a **naming invariant**: derived from
  `local.name_prefix`, so name↔environment consistency holds by construction.
- Tagging is **closed under growth**: `merge(local.default_tags, var.tags)`
  means new stack-specific tags can never drop the platform's ownership tags.

## How to write one

```hcl
resource "azurerm_resource_group" "main" {
  name     = "rg-${local.name_prefix}"
  location = var.location
  tags     = merge(local.default_tags, var.tags)

  lifecycle {
    postcondition {
      condition     = startswith(self.name, "rg-")
      error_message = "Resource groups must carry the platform rg- prefix."
    }
  }
}
```

Guidelines:

- Prefer **construction over assertion** (derive names from the local) and
  assert only what construction cannot guarantee.
- Make `error_message` say *why* — it is the reviewer-facing property
  statement.
- Keep one invariant per block; do not bundle unrelated conditions.

## When an invariant fails

1. A failing validation/condition on plan is a **real defect** in the change,
   not noise. Do not loosen the condition to make the plan pass.
2. If the invariant itself is wrong, change it in its own reviewed commit with
   the reasoning in the message.

## Workflow checklist

- [ ] Every new variable has a domain validation where constrained.
- [ ] Every new resource derives its name/tags from the platform locals.
- [ ] Non-obvious assumptions are preconditions; promises are postconditions.
- [ ] `terraform validate` is green locally before pushing.
