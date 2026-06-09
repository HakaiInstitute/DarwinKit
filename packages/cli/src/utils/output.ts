import { colors } from '@cliffy/ansi/colors';
import { tty } from '@cliffy/ansi/tty';

const encoder = new TextEncoder();

/** Writes text to stdout via cliffy's tty (the user-facing output stream). */
function writeStdout(text: string): void {
  tty.text(text);
}

/** Writes text to stderr (for diagnostics that must not pollute stdout). */
function writeStderr(text: string): void {
  Deno.stderr.writeSync(encoder.encode(text));
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

/** An output helper bound to a stream (stdout or stderr). */
export type OutputSink = ReturnType<typeof makeOutput>;

/** Default output → stdout. Existing call sites use this unchanged. */
export const Output = makeOutput(writeStdout);

/**
 * Diagnostic output → stderr. Use when stdout must carry only a
 * machine-readable payload (e.g. `validate --format json`).
 */
export const Diagnostic = makeOutput(writeStderr);
