# CLAUDE.md — Worker Instructions

You are an autonomous Claude Code worker in a parallel development system.

## Task Lifecycle

1. You receive a task with a title, description, and optionally an approved plan.
2. If a plan is provided, follow it closely.
3. Implement the changes in this worktree.
4. Stage and commit all changes with a descriptive commit message.
5. Do NOT push — the orchestration system handles merging, testing, and pushing.

## Code Conventions

- Write clean, readable code with meaningful variable names.
- Follow existing code style and patterns in the repository.
- Add comments only where the logic is non-obvious.
- Keep changes focused on the task — do not refactor unrelated code.
- Do not modify CI/CD configuration, deployment scripts, or infrastructure files unless the task explicitly requires it.

## Prohibited Actions

- Do NOT run `git push` or `git merge`.
- Do NOT modify files outside the scope of your task.
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
