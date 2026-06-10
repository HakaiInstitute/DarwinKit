import { colors } from '@cliffy/ansi/colors';

const encoder = new TextEncoder();

interface SyncWriter {
  writeSync(p: Uint8Array): number;
}

/**
 * Write all of `text` to the stream, draining partial writes
 * (`writeSync` may consume fewer bytes than offered).
 */
export function writeAll(stream: SyncWriter, text: string): void {
  const data = encoder.encode(text);
  let written = 0;

  while (written < data.length) {
    written += stream.writeSync(data.subarray(written));
  }
}

/** Builds an output helper that writes every line through the given sink. */
export function makeOutput(write: (text: string) => void) {
  return {
    line(text = ''): void {
      write(text + '\n');
    },
    blank(): void {
      write('\n');
    },
    info(message: string): void {
      write(colors.blue(message) + '\n');
    },
    success(message: string): void {
      write(colors.green(message) + '\n');
    },
    error(message: string): void {
      write(colors.red(message) + '\n');
    },
    warning(message: string): void {
      write(colors.yellow(message) + '\n');
    },
    muted(message: string): void {
      write(colors.gray(message) + '\n');
    },
    bold(message: string): void {
      write(colors.bold(message) + '\n');
    },
    section(emoji: string, title: string): void {
      write('\n' + colors.blue(`${emoji} ${title}`) + '\n');
    },
  };
}

/**
 * Human-facing messages: status, progress, errors, hints. Bound to STDERR
 * so stdout stays clean for payloads — `validate --format json | jq` works
 * in every mode, and `2>/dev/null` silences diagnostics without touching
 * results.
 */
export const Output = makeOutput((text) => writeAll(Deno.stderr, text));

/**
 * The command's result payload: the table report, JSON, or Markdown.
 * Bound to STDOUT — payloads are the only thing that belongs there.
 */
export const Payload = makeOutput((text) => writeAll(Deno.stdout, text));
