import { colors } from '@cliffy/ansi/colors';
import { Spinner } from '@std/cli/unstable-spinner';
import * as Match from 'effect/Match';
import { writeAll } from './output.ts';

type SpinnerColor = 'blue' | 'green' | 'yellow' | 'red' | 'gray';
type SpinnerState = 'idle' | 'animated' | 'plain';

interface SpinnerOptions {
  message: string;
  color?: SpinnerColor;
}

/**
 * Progress reporting on stderr: an animated spinner when stderr is a
 * terminal, plain progress lines otherwise. Never writes to stdout, so
 * payloads (table/JSON/Markdown) stay clean for redirection and piping.
 *
 * Undefined `update()` colors default to blue when animated and gray
 * (muted) for plain lines.
 */
export class ProgressSpinner {
  private spinner: Spinner;
  private state: SpinnerState = 'idle';

  constructor(options: SpinnerOptions) {
    const colorFn = this.getColorFunction(options.color || 'blue');
    this.spinner = new Spinner({
      message: colorFn(options.message),
      color: options.color || 'blue',
      output: Deno.stderr,
    });
  }

  private getColorFunction(color: SpinnerColor): (text: string) => string {
    return Match.value(color).pipe(
      Match.when('blue', () => colors.blue),
      Match.when('green', () => colors.green),
      Match.when('yellow', () => colors.yellow),
      Match.when('red', () => colors.red),
      Match.when('gray', () => colors.gray),
      Match.exhaustive,
    );
  }

  start(): void {
    if (this.state !== 'idle') {
      return;
    }

    if (Deno.stderr.isTerminal()) {
      this.spinner.start();
      this.state = 'animated';
    } else {
      this.state = 'plain';
    }
  }

  update(message: string, color?: SpinnerColor): void {
    Match.value(this.state).pipe(
      Match.when('animated', () => {
        this.spinner.message = this.getColorFunction(color || 'blue')(message);
      }),
      Match.when('plain', () => {
        writeAll(Deno.stderr, this.getColorFunction(color || 'gray')(message) + '\n');
      }),
      Match.when('idle', () => {}),
      Match.exhaustive,
    );
  }

  stop(): void {
    if (this.state === 'animated') {
      this.spinner.stop();
    }
    this.state = 'idle';
  }
}
