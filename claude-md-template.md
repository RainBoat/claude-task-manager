# CLAUDE.md — Worker Instructions

You are an autonomous Claude Code worker in a parallel development system.

## CRITICAL: Working Directory Constraint

**You must ONLY create and modify files within your current working directory.**
- Do NOT create files in `/app`, `/tmp`, or any path outside your working directory.
- Do NOT modify the parallel development system itself (no changes to `manager/`, `worker/`, `frontend/` under `/app`).
- If a task description seems ambiguous, implement the feature within THIS project's codebase.
- Before creating any file, verify the path is relative to your current working directory.

## CRITICAL: Git Repository Integrity

**NEVER touch the `.git` file or directory in the working directory.**
- Do NOT run `rm -rf .git`, `git init`, or any command that destroys or reinitializes the git repository.
- The `.git` file is a worktree link — deleting it will destroy the connection to the main repository and lose all your work.
- If you see a `.git` file (not directory), that is NORMAL — it means you are in a git worktree. Do NOT replace it.
- If `git status` shows errors, do NOT try to fix them by reinitializing git. Report the error instead.

## Task Lifecycle

1. You receive a task with a title, description, and optionally an approved plan.
2. If a plan is provided, follow it closely.
3. **First explore the project structure** — run `ls`, read key files, understand the tech stack before writing code.
4. Implement the changes in this worktree.
5. Stage and commit all changes with a descriptive commit message.
6. Do NOT push — the orchestration system handles merging, testing, and pushing.

## Code Conventions

- Write clean, readable code with meaningful variable names.
- Follow existing code style and patterns in the repository.
- Add comments only where the logic is non-obvious.
- Keep changes focused on the task — do not refactor unrelated code.
- Do not modify CI/CD configuration, deployment scripts, or infrastructure files unless the task explicitly requires it.

## Prohibited Actions

- Do NOT run `git push` or `git merge`.
- Do NOT run `git init` or `rm -rf .git` — this will destroy the worktree link.
- Do NOT modify files outside the scope of your task.
- Do NOT create files outside your current working directory.
- Do NOT install new dependencies unless the task requires it.
- Do NOT delete or rename existing tests unless replacing them.
- Do NOT modify this CLAUDE.md file.

## Commit Messages

Use conventional commits format:
- `feat: <description>` for new features
- `fix: <description>` for bug fixes
- `refactor: <description>` for refactoring
- `docs: <description>` for documentation
- `test: <description>` for test changes

Include the task ID in the commit body: `Task-ID: <id>`

## Testing

- If the project has tests, run them before committing to verify your changes.
- If you add new functionality, add corresponding tests.
- If tests fail due to your changes, fix them before committing.

## Experience — Learn from History

**Before starting your task**, check `PROGRESS.md` in the repo root. It contains structured experience entries from previous tasks — problems encountered, solutions applied, and lessons learned. Use this knowledge to avoid repeating past mistakes.

If relevant entries exist for similar work (same files, same patterns), incorporate those lessons into your approach.

After completing your task, the system will automatically log your experience to PROGRESS.md with structured fields (problem/solution/prevention) so future workers can benefit.

If you encounter notable issues or discover important patterns, mention them in your commit message body so they get captured in the experience log.

## Architecture Notes

(Project-specific notes will be added here by the team)
