# Contributing

Thanks for considering a contribution. The plugin gets better when real users push back on what's wrong, missing, or unclear.

## Quick orientation

Everything that runs lives in [`plugins/lovable-to-app-store/`](./plugins/lovable-to-app-store/). The structure:

- `skills/ship/SKILL.md` — the entry point Claude reads when you say *"ship this app"*
- `skills/ship/references/` — the deep reference docs that SKILL.md points to
- `skills/ship/references/templates/` — frozen files Claude copies verbatim into a user's repo
- `skills/add-native/SKILL.md` — entry point for *"add [feature]"*
- `skills/update/SKILL.md` — entry point for *"push OTA update"*

Three top-level docs you'll likely touch:
- `README.md` (top of repo) — marketing-facing landing page
- `docs/` — user-facing guides (getting-started, FAQ, troubleshooting)
- `CHANGELOG.md` — what changed between versions

## Before you open a PR

- [ ] **Test end-to-end.** Ship a throwaway Lovable app to TestFlight with your modified plugin. The reference docs are battle-tested — adding a "small change" to one can break the chain. Always do a real run.
- [ ] **No personal info in the diff.** Run `grep -rE "your-email-pattern|your-real-bundle-id|internal-url"` over your changes before pushing. The repo is public.
- [ ] **Update the CHANGELOG.** Add a bullet under `## [Unreleased]` describing the change in user-facing terms.
- [ ] **Check cross-references.** If you renamed or moved a file, grep for any `references/old-name.md` mentions and update them.

## Style

- **Reference docs are imperative.** They're written FOR Claude to follow, not for humans to read. Use second-person commands ("Click Generate", "Save the Key ID") rather than third-person prose.
- **Templates are frozen.** If you change a file under `templates/`, prove via real ship runs that the change is compatible across the existing app types. Don't speculatively "improve" a template.
- **Keep prose tight.** A reader has a half-finished build — they don't have time for hedging.

## Commit messages

Conventional commits welcome but not required. Plain English is fine: `Fix Google Sign-In drawer not closing on iOS 18`. The CHANGELOG is the canonical record, not git history.

## Reviewing PRs

PRs from new contributors get reviewed within a week. If a PR touches the signing / certificates / provisioning logic, expect a slower review — those paths break in non-obvious ways and need careful checking.

## What we'll likely decline

- "Cosmetic" rewrites of reference docs — they look unpolished on purpose; they're optimized for an LLM reading them, not a human.
- New service integrations without a clear demand path. (If you want to add e.g. Mixpanel support, open an issue first to discuss whether it belongs here vs. a sibling plugin.)
- Anything that adds dependencies on private infrastructure, paid-tier-only services, or your specific agency's tooling.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be decent.
