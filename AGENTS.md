# MySex Workspace Instructions

## Repository boundaries

- `D:\mysex` is the public calculator repository.
- `D:\mysex\private` is a separate optional private repository and is ignored by the public repository.
- Never stage, commit, copy, or push personal images, private HTML, Admin files, secrets, backups, or private planning into the public repository.
- Public work should follow `PLAN.md`.
- When `private\AGENTS.md` exists, read it before inspecting or changing anything under `private\`.

## Existing-machine migration safety

If a machine already has an older MySex folder containing mixed public and private files:

1. Stop before `git pull`, `git clean`, reset, checkout, clone-overwrite, delete, or bulk move.
2. Inventory tracked, untracked, ignored, nested, and duplicate files first.
3. Create and verify a complete backup outside the working copy.
4. Treat all personal photos, intimate media, private profile pages, Admin files, logs, credentials, exports, and unknown files as private until classified.
5. Do not overwrite files with matching names. Compare size and SHA-256 first; preserve both versions when hashes differ.
6. Migrate uncertain/private files into a dated inbox inside the private repository before reorganizing them.
7. Commit and verify the private repository before cleaning the old mixed workspace.
8. Ask the user before deleting any original, backup, duplicate, or unknown file.

## Routine checks

- Run `git status` in both repositories separately.
- Confirm the current repository root with `git rev-parse --show-toplevel` before staging or committing.
- Stage explicit paths; do not use broad staging from the public root when unclassified files exist.

