# MySex Workspace Instructions

## Repository boundaries

- `D:\mysex` is the public calculator repository.
- `D:\mysex\private` is a separate optional private repository and is ignored by the public repository.
- Never stage, commit, copy, or push personal images, private HTML, Admin files, secrets, backups, or private planning into the public repository.
- Public work should follow `PLAN.md`.
- When `private\README.md` exists, read it before inspecting or changing anything under `private\`.

## Existing-machine migration safety

If a machine already has an older MySex folder containing mixed public and private files, stop before any pull/clean/reset operations and follow the detailed migration sequence in `private/README.md`.
Always back up first, compare SHA-256 before overwriting, and ask the user before deleting any file.

## Routine checks

- Run `git status` in both repositories separately.
- Confirm the current repository root with `git rev-parse --show-toplevel` before staging or committing.
- Stage explicit paths; do not use broad staging from the public root when unclassified files exist.


