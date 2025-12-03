# DarwinKit CLI

A CLI for DarwinKit validation and data processing operations.

## Overview

This package provides a terminal-based interface to DarwinKit's core functionality using [Cliffy](https://cliffy.io/) for command parsing and formatted output.

**Current Status**: Early development - only the validation command is implemented.

## Dependencies

- `@dwkt/domain` - Domain types and schemas
- `@dwkt/core` - Core validation and workspace operations
- `@cliffy/command` - CLI framework
- `effect` - Composable data processing and error handling

## Usage

### Run Interactively

```bash
deno task dev
```

This starts the CLI in development mode with all necessary permissions.

### Available Commands

#### `validate`

Validates datasets using a `darwinkit.json` configuration file.

```bash
# Auto-discover config in current/parent directories
deno task dev validate

# Specify config directory
deno task dev validate --config /path/to/workspace

# Output as JSON
deno task dev validate --format json

# Specify output directory for JSON results
deno task dev validate --format json --output-dir ./results
```

**Options:**

- `--config <path>` - Path to configuration directory (defaults to current directory)
- `--format <format>` - Output format: `table` (default) or `json`
- `--output-dir <path>` - Directory for JSON output files (default: `./validation_results`)

## Testing

Run the CLI test suite:

```bash
deno task test
```

## Building

Compile standalone binaries for distribution:

```bash
# macOS (Apple Silicon)
deno task compile:macos

# Linux (x86_64)
deno task compile:linux
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
- Use `prettyPrintCause` from `@dwkt/core` for user-friendly error formatting

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
