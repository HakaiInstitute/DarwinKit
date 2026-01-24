/**
 * Effect-based spinner utility for automatic lifecycle management
 */

import { colors } from '@cliffy/ansi/colors';
import { Spinner } from '@std/cli/unstable-spinner';
import * as Effect from 'effect/Effect';

export interface SpinnerOptions {
  message: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray';
}

/**
 * Create and manage a spinner for progress indication
 */
export class ProgressSpinner {
  private spinner: Spinner;
  private isRunning = false;

  constructor(options: SpinnerOptions) {
    const colorFn = this.getColorFunction(options.color || 'blue');
    this.spinner = new Spinner({
      message: colorFn(options.message),
      color: options.color || 'blue',
    });
  }

  private getColorFunction(color: string): (text: string) => string {
    switch (color) {
      case 'green':
        return colors.green;
      case 'yellow':
        return colors.yellow;
      case 'red':
        return colors.red;
      case 'gray':
        return colors.gray;
      case 'blue':
      default:
        return colors.blue;
    }
  }

  start(): void {
    if (!this.isRunning) {
      this.spinner.start();
      this.isRunning = true;
    }
  }

  update(message: string, color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray'): void {
    if (this.isRunning) {
      const colorFn = this.getColorFunction(color || 'blue');
      this.spinner.message = colorFn(message);
    }
  }

  succeed(message?: string): void {
    if (this.isRunning) {
      this.spinner.stop();
      this.isRunning = false;
      if (message) {
        console.log(colors.bold(colors.green(message)));
      }
    }
  }

  fail(message?: string): void {
    if (this.isRunning) {
      this.spinner.stop();
      this.isRunning = false;
      if (message) {
        console.log(colors.bold(colors.red(message)));
      }
    }
  }

  warn(message?: string): void {
    if (this.isRunning) {
      this.spinner.stop();
      this.isRunning = false;
      if (message) {
        console.log(colors.bold(colors.yellow(message)));
      }
    }
  }

  stop(): void {
    if (this.isRunning) {
      this.spinner.stop();
      this.isRunning = false;
    }
  }
}

/**
 * Operations available to update a running spinner
 */
export interface SpinnerOps {
  /**
   * Update the spinner message
   */
  update: (
    message: string,
    color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray',
  ) => Effect.Effect<void>;

  /**
   * Stop with success message
   */
  succeed: (message?: string) => Effect.Effect<void>;

  /**
   * Stop with failure message
   */
  fail: (message?: string) => Effect.Effect<void>;

  /**
   * Stop with warning message
   */
  warn: (message?: string) => Effect.Effect<void>;
}

/**
 * Wraps an Effect with automatic spinner lifecycle management.
 *
 * The spinner will:
 * - Start automatically when the effect begins
 * - Be available for updates during execution via the provided operations
 * - Stop automatically when the effect completes (success or failure)
 * - Be guaranteed to stop even on defects via Effect's resource management
 *
 * @example
 * ```typescript
 * const program = withSpinner(
 *   { message: 'Loading data...' },
 *   (spinner) => Effect.gen(function* (_) {
 *     // Spinner is running
 *     const data = yield* _(loadData());
 *
 *     // Update spinner message
 *     yield* _(spinner.update('Processing data...'));
 *     const result = yield* _(processData(data));
 *
 *     return result;
 *   })
 * );
 * ```
 *
 * @param options - Spinner configuration (message, color)
 * @param effect - Effect to run with spinner active, receives SpinnerOps for updates
 * @returns Effect that manages spinner lifecycle
 */
export function withSpinner<A, E, R>(
  options: SpinnerOptions,
  effect: (spinner: SpinnerOps) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    // Acquire: Create and start spinner
    Effect.sync(() => {
      const spinner = new ProgressSpinner(options);
      spinner.start();
      return spinner;
    }),
    // Use: Provide spinner operations to the effect
    (spinner) => {
      const ops: SpinnerOps = {
        update: (message, color) => Effect.sync(() => spinner.update(message, color)),
        succeed: (message) => Effect.sync(() => spinner.succeed(message)),
        fail: (message) => Effect.sync(() => spinner.fail(message)),
        warn: (message) => Effect.sync(() => spinner.warn(message)),
      };
      return effect(ops);
    },
    // Release: Always stop spinner, even on error
    (spinner) => Effect.sync(() => spinner.stop()),
  );
}

/**
 * Simplified version of withSpinner for effects that don't need to update the spinner.
 *
 * Use this when you just want to show a spinner during an operation without
 * needing to update its message.
 *
 * @example
 * ```typescript
 * const program = withSimpleSpinner(
 *   { message: 'Loading...' },
 *   loadData()
 * );
 * ```
 *
 * @param options - Spinner configuration (message, color)
 * @param effect - Effect to run with spinner active
 * @returns Effect that manages spinner lifecycle
 */
export function withSimpleSpinner<A, E, R>(
  options: SpinnerOptions,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return withSpinner(options, () => effect);
}
