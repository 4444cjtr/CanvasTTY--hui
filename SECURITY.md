# Security policy

## Supported version

CanvasTTY `0.9.x` is the current public preview line. It is pre-1.0 software and its unsigned cross-platform packages require additional platform warnings to be acknowledged.

## Reporting a vulnerability

Do not publish credentials, terminal history, private paths, or exploit details in a public issue.

Use the repository's **Security → Report a vulnerability** flow when private vulnerability reporting is available. If it is not available, open a public issue containing only a short non-sensitive request for a private contact channel.

Include the CanvasTTY version, operating system, affected flow, impact, and minimal reproduction steps. Replace real tokens, usernames, home directories, project names, prompts, and terminal output with synthetic values.

## Data boundary

- Provider credentials remain in each provider CLI's local credential store. CanvasTTY reads them only inside the trusted Electron main process and does not copy them into project files or settings.
- CanvasTTY settings are stored below Electron's per-user `userData` directory.
- PTY scrollback is held in bounded process memory and is not committed to the repository.
- CanvasTTY has no project-operated telemetry endpoint and does not upload application logs.
- Provider usage requests go only to the matching provider adapter; sanitized limit snapshots cross IPC, never raw responses or credentials.

The repository runs `npm run audit:secrets` in CI and before packaging. This is a guardrail, not a reason to commit a secret temporarily: if a real secret ever reaches Git history, revoke it immediately and rewrite/purge the affected history before publishing.
