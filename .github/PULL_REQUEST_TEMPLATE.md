## Description

<!-- Briefly describe what this PR does and why. -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] CI/CD improvement
- [ ] Refactoring (no functional changes)
- [ ] Test addition/update

## Related Issues

<!-- Link any related issues: Fixes #123, Relates to #456 -->

## Changes Made

<!-- List the specific files changed and what was changed in each. -->

- 
- 
- 

## Testing

<!-- Describe the tests you ran and how to reproduce them. -->

- [ ] `npm run test` — all tests pass
- [ ] `npm run lint` — no lint errors
- [ ] `npm run build` — build succeeds
- [ ] `npm run typecheck` — 0 TypeScript errors
- [ ] `cargo check` — Rust compiles (if applicable)
- [ ] `cargo clippy -- -D warnings` — no warnings (if applicable)
- [ ] Manual testing — describe what you tested

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] `npm run verify:docs` — doc counts are fresh (update any stale counts in the same PR)
- [ ] A new service or component has a row in `CLAUDE.md`'s Do Not Duplicate table (`npm run verify:dnd-coverage`, `npm run verify:dnd-map`)
- [ ] A new Rust process spawn uses `no_window()` (`npm run verify:no-window-coverage`)
- [ ] For anything touching the Rust backend, spawned processes or stored data: a desktop E2E spec (`e2e-desktop/`)
- [ ] Any dependent changes have been merged and published

## Screenshots (if applicable)

<!-- Add screenshots to demonstrate UI changes. -->

## Additional Notes

<!-- Add any other context about the PR here. -->
