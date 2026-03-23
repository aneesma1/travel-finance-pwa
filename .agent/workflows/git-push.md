---
description: How to push changes to GitHub for travel-finance-pwa
---

# Git Push Workflow for travel-finance-pwa

## Branch Structure

This repo has **two branches** that must always be kept in sync:

| Branch | Purpose |
|--------|---------|
| `master` | Active working branch — all code changes go here |
| `main` | GitHub Pages / production branch — must mirror `master` |

> **IMPORTANT**: GitHub Pages serves from `main`. Always push to both branches after any commit.

## Standard Push Procedure

After making all code changes and committing:

// turbo
1. Stage and commit on `master`:
```powershell
git add -A
git commit -m "your commit message"
git push origin master
```

// turbo
2. Sync `main` to match `master`:
```powershell
git checkout main
git merge master --no-edit
git push origin main
git checkout master
```

> **Note**: Use `;` instead of `&&` as the command separator in PowerShell.

## Why This Is Needed

GitHub's default/display branch is `main`. When commits land on `master` but not `main`, GitHub shows a yellow banner:
> *"master had recent pushes X seconds ago — Compare & pull request"*

Keeping `main` in sync after every push eliminates this banner and ensures GitHub Pages (if enabled) always serves the latest code.

## Session Documentation

After every push, also update `SESSION_TRACKING.md` to append a new entry under the appropriate version heading, and commit it to both branches following the procedure above.
