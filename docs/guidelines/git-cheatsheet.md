---
title: Git cheatsheet
doc_class: learning
status: live
audience: human
last_reviewed: 2026-04-21
summary: Command quick reference for daily Git workflows.
---

# Git cheatsheet

Quick reference for common tasks. Commands assume a typical CLI setup (Git 2.23+ for `switch` / `restore`).

---

## Status and diffs

| Goal | Command |
|------|---------|
| Working tree summary | `git status` |
| Short status | `git status -sb` |
| Unstaged changes | `git diff` |
| Staged changes | `git diff --staged` |
| Compare to branch | `git diff main...HEAD` |

---

## Stage and commit

| Goal | Command |
|------|---------|
| Stage file | `git add path/to/file` |
| Stage interactively (hunks) | `git add -p` |
| Unstage, keep edits | `git restore --staged path/to/file` |
| Commit | `git commit -m "message"` |
| Amend last commit (message and/or files) | `git commit --amend` |

**Note:** Amending rewrites the last commit. Safe before push; after push, coordinate with `git push --force-with-lease` if your workflow allows it.

---

## Discard changes

| Goal | Command |
|------|---------|
| Drop unstaged edits in a file | `git restore path/to/file` |
| Drop unstaged edits everywhere | `git restore .` |

Use with care; uncommitted work is lost unless recoverable from stash/reflog.

---

## Branches and checkout

| Goal | Command |
|------|---------|
| List local branches | `git branch` |
| List all (incl. remote) | `git branch -a` |
| Switch branch | `git switch branch-name` |
| Create and switch | `git switch -c new-branch` |
| Delete local branch | `git branch -d branch-name` |

---

## Remotes, fetch, push, pull

| Goal | Command |
|------|---------|
| List remotes | `git remote -v` |
| Fetch (no merge) | `git fetch` |
| Fetch then prune stale refs | `git fetch --prune` |
| Push current branch | `git push` |
| Push new upstream | `git push -u origin branch-name` |
| Integrate (merge) | `git pull` |
| Integrate (rebase) | `git pull --rebase` |

---

## History

| Goal | Command |
|------|---------|
| Compact log | `git log --oneline -n 20` |
| Graph view | `git log --oneline --graph --decorate -n 30` |
| One commit | `git show SHA` |
| Who changed each line | `git blame path/to/file` |

---

## Merge and rebase

| Goal | Command |
|------|---------|
| Merge branch into current | `git merge other-branch` |
| Rebase current onto upstream | `git rebase main` |
| Continue / abort rebase | `git rebase --continue` / `git rebase --abort` |
| Apply one commit elsewhere | `git cherry-pick SHA` |

---

## Stash

| Goal | Command |
|------|---------|
| Stash tracked changes | `git stash` |
| Stash with message | `git stash push -m "wip parser"` |
| Include untracked | `git stash -u` |
| List stashes | `git stash list` |
| Apply latest and drop | `git stash pop` |
| Apply latest, keep stash | `git stash apply` |

---

## Undo commits (local)

| Goal | Command |
|------|---------|
| Undo last commit, keep changes staged | `git reset --soft HEAD~1` |
| Undo last commit, keep changes unstaged | `git reset --mixed HEAD~1` |
| Reset branch to remote (destructive) | `git reset --hard origin/branch-name` |

`--hard` discards uncommitted changes. Prefer `--force-with-lease` over `--force` when updating a shared remote branch.

---

## Tags

| Goal | Command |
|------|---------|
| List tags | `git tag` |
| Create lightweight tag | `git tag v1.2.3` |
| Push tags | `git push --tags` |

---

## Bisect (find bad commit)

```text
git bisect start
git bisect bad          # current commit is bad
git bisect good v1.0.0  # known good baseline
# test each checkout; then:
git bisect good | git bisect bad
git bisect reset        # when done
```

---

## Recovery

| Goal | Command |
|------|---------|
| Recent HEAD movements | `git reflog` |
| Recover dangling commit | `git cherry-pick SHA` or `git branch rescue SHA` |

---

## Configuration (once per machine)

| Goal | Command |
|------|---------|
| Set name / email | `git config --global user.name "..."` / `user.email "..."` |
| Default branch name | `git config --global init.defaultBranch main` |
| Useful log alias (optional) | `git config --global alias.lg "log --oneline --graph --decorate -20"` |

---

## Related docs

- Project commit workflow (if used): `.cursor/commands/git-commit.md`
