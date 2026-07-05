# @dwkit/cli

Command-line interface for DarwinKit validation and transformation operations.

## Overview

This package provides a terminal-based interface to DarwinKit's core functionality using [Cliffy](https://cliffy.io/) for command parsing and formatted output.

## Dependencies

- `@dwkit/domain` - Domain types and schemas
- `@dwkit/core` - Core validation and workspace operations
- `@cliffy/command` - CLI framework
- `@cliffy/table` - Table formatting

## Usage

### Run Interactively

```bash
deno task dev
```

This starts the CLI in development mode with all necessary permissions.

### Available Commands

#### `validate`

Validates datasets using a `darwinkit.yaml` configuration file.

```bash
# Auto-discover config in current/parent directories
deno task dev validate

# Specify config directory
deno task dev validate --config /path/to/workspace

# Output results as JSON to stdout (pipeable, e.g. into jq)
deno task dev validate --format json

# Output results as Markdown to stdout
deno task dev validate --format markdown

# Write results to a file instead of stdout
deno task dev validate --format json --output-dir ./results
```

**Options:**

- `--config <path>` - Path to configuration directory (defaults to current directory)
- `--format <format>` - Output format: `table` (default), `json`, or `markdown`
- `--output-dir <path>` - Write JSON/Markdown results to a file in this directory instead of stdout. When omitted, `json` and `markdown` are written to stdout.
- `--fail-fast` - Stop validation on the first dataset with errors
- `--strict` - Exit with code 2 when warnings are present (default: warnings exit 0)

All human-readable diagnostics (progress, status, errors) are written to **stderr** for every
format, so stdout always carries exactly one thing: the result payload (table report, JSON, or
Markdown). `dwkit validate --format json | jq .` and `dwkit validate > report.txt` both
work without diagnostics mixed into the output (set `NO_COLOR=1` for a plain-text report).

## Testing

Run the CLI test suite:

```bash
deno task test
```

## Building

Compile standalone binaries for distribution:

```bash
# macOS (Apple Silicon / Intel)
deno task compile:darwin-arm64
deno task compile:darwin-x86_64

# Linux (x86_64 / arm64)
deno task compile:linux-x86_64
deno task compile:linux-arm64

# Windows (x86_64)
deno task compile:windows-x86_64
```

Binaries are output to `./dist/` directory.

## Development

### Adding New Commands

1. Create command module in `src/cmd/<command-name>/`
2. Implement command using Cliffy's `Command` class
3. Import and register in `main.ts`
4. Add tests in command directory

### Error Handling

CLI commands use Effect's error handling patterns:

- Expected errors (validation failures, missing files) use `Effect.fail`
- Unexpected errors (system failures) use `Effect.die`
- Use `Match.exhaustive` from Effect for user-friendly error formatting

### Output Formatting

Use Cliffy's formatting utilities:

- `colors` for colored terminal output
- `Table` for tabular data display
- Exit codes: `0` (success), `1` (failure), `2` (warnings), `3` (errors)

## Project Structure

```
packages/cli/
├── main.ts              # CLI entry point
├── src/
│   └── cmd/
│       └── validate/    # Validate command implementation
├── deno.json            # Package configuration
└── README.md            # This file
```
