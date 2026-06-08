import { Spinner } from '@std/cli/unstable-spinner';
import { colors } from '@cliffy/ansi/colors';

interface SpinnerOptions {
  message: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray';
}

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

  stop(): void {
    if (this.isRunning) {
      this.spinner.stop();
      this.isRunning = false;
    }
  }
}
