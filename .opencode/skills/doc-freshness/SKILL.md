---
name: doc-freshness
description: Check documentation freshness against actual code — find stale counts, outdated claims, broken cross-references
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: maintenance
  scope: documentation
---

## What I Do

I verify that every documentation file matches the actual state of the codebase. I count actual files, tests, lines, and compare against what the docs claim.

## When To Use Me

Use this when:
- After adding new files, services, or tests
- Before release to ensure docs are current
- When onboarding new contributors
- When a doc seems outdated

## Freshness Check Checklist

### 1. CLAUDE.md (Root)

#### Numbers to Verify
- [ ] "42 test files" → count actual `.test.*` files in `src/test/`
- [ ] "158 tests" → count actual `it()`/`test()` blocks
- [ ] "65+ services" → count actual files in `src/services/`
- [ ] "9 agents" → count files in `src/agents/`
- [ ] "lib.rs is ~6,993 lines" → run `wc -l src-tauri/src/lib.rs`
- [ ] "Coverage 27.83%" → run `npm run test:coverage` and check
- [ ] "42 test files, 158 tests, all passing" → run `npm run test` and check

#### Commands to Verify
- [ ] Every npm script in the "Build Commands" section exists in `package.json`
- [ ] Every cargo command referenced works from `src-tauri/`
- [ ] Every referenced file path actually exists

#### Do Not Duplicate Table
- [ ] Every entry in the table still accurately describes what exists
- [ ] No new duplicates have been created since the table was written

### 2. docs/ALPHONSO_GROUND_TRUTH.md

#### Section 1: Project Identity
- [ ] Version number matches `package.json` and `tauri.conf.json`
- [ ] Backend/frontend stack descriptions are current

#### Section 2: Agent Roster
- [ ] 9 agents listed with correct roles
- [ ] Key constraints accurate

#### Section 3: Service Layer
- [ ] Service count accurate
- [ ] All listed services still exist
- [ ] No new major services missing from the list

#### Section 4: Test Suite
- [ ] Test file count matches actual
- [ ] All listed test files still exist
- [ ] No new test files missing from the list

#### Section 5: CI/CD
- [ ] Workflow descriptions match current `.github/workflows/`
- [ ] CI status claims are accurate

#### Section 8: Real Gaps
- [ ] Closed gaps are marked with [x]
- [ ] Open gaps still exist (not yet fixed)
- [ ] No new gaps are missing from the list

### 3. ARCHITECTURE.md

#### Line Counts
- [ ] `lib.rs` line count matches actual
- [ ] Component line counts (if listed) are approximate

#### Descriptions
- [ ] Stack table matches `package.json` dependencies
- [ ] Agent roster matches actual 9 agents
- [ ] Service groupings match actual organization
- [ ] Storage model matches actual SQLite tables
- [ ] Security model matches actual CSP and capabilities

### 4. docs/CHANGELOG.md

- [ ] [Unreleased] section contains accurate recent changes
- [ ] [0.1.0] summary matches actual v0.1.0 state
- [ ] Dates are accurate

### 5. docs/CONNECTORS.md

- [ ] All 11+ connectors documented
- [ ] Env var names match actual `.env.example`
- [ ] Setup steps are still accurate
- [ ] Limitations are honestly stated

### 6. Cross-Reference Check

- [ ] CLAUDE.md references to `docs/` files — do they exist?
- [ ] ARCHITECTURE.md references to services — do they exist?
- [ ] Setup guides reference correct commands
- [ ] No broken internal links

## Output Format

```markdown
# Documentation Freshness Report — [DATE]

## Staleness Score
- X/Y documents are current
- X documents have errors
- X documents are significantly stale

## Specific Errors
| Document | Line | Says | Actually | Fix |

## Missing Documentation
- [What exists in code but has no doc]

## Cross-Reference Breaks
- [Doc A references Doc B which doesn't exist]

## Recommended Updates (Priority Order)
1. [Most impactful fix]
2. ...
```
