/**
 * Spinner utility for long-running operations
 */

import { Spinner } from '@std/cli/unstable-spinner';
import { colors } from '@cliffy/ansi/colors';

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

  /**
   * Start the spinner
   */
  start(): void {
    if (!this.isRunning) {
      this.spinner.start();
      this.isRunning = true;
    }
  }

  /**
   * Update spinner message
   */
  update(message: string, color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray'): void {
    if (this.isRunning) {
      const colorFn = this.getColorFunction(color || 'blue');
      this.spinner.message = colorFn(message);
    }
  }

  /**
   * Stop the spinner with success
   */
  succeed(message?: string): void {
    if (this.isRunning) {
      this.spinner.stop();
      this.isRunning = false;
      if (message) {
        console.log(colors.green(`✅ ${message}`));
      }
    }
  }

  /**
   * Stop the spinner with failure
   */
  fail(message?: string): void {
    if (this.isRunning) {
      this.spinner.stop();
      this.isRunning = false;
      if (message) {
        console.log(colors.red(`❌ ${message}`));
      }
    }
  }

  /**
   * Stop the spinner with warning
   */
  warn(message?: string): void {
    if (this.isRunning) {
      this.spinner.stop();
      this.isRunning = false;
      if (message) {
        console.log(colors.yellow(`⚠️  ${message}`));
      }
    }
  }

  /**
   * Stop the spinner without message
   */
  stop(): void {
    if (this.isRunning) {
      this.spinner.stop();
      this.isRunning = false;
    }
  }
}

/**
 * Helper to create and run a spinner during an async operation
 */
export async function withSpinner<T>(
  options: SpinnerOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const spinner = new ProgressSpinner(options);
  spinner.start();

  try {
    const result = await operation();
    spinner.stop();
    return result;
  } catch (error) {
    spinner.stop();
    throw error;
  }
}
