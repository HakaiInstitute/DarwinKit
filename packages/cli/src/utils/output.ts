/**
 * CLI Output utilities using Cliffy TTY for better terminal control
 */

import { colors } from '@cliffy/ansi/colors';
import { tty } from '@cliffy/ansi/tty';

/**
 * Output utilities for CLI with TTY control
 */
export const Output = {
  /**
   * Write text to stdout with optional newline
   */
  write(text: string, newline = false): void {
    tty.text(text);
    if (newline) {
      tty.text('\n');
    }
  },

  /**
   * Write line to stdout (with newline)
   */
  line(text = ''): void {
    this.write(text, true);
  },

  /**
   * Write blank line
   */
  blank(): void {
    tty.text('\n');
  },

  /**
   * Info message (blue)
   */
  info(message: string): void {
    tty.text(colors.blue(message) + '\n');
  },

  /**
   * Success message (green)
   */
  success(message: string): void {
    tty.text(colors.green(message) + '\n');
  },

  /**
   * Error message (red)
   */
  error(message: string): void {
    tty.text(colors.red(message) + '\n');
  },

  /**
   * Warning message (yellow)
   */
  warning(message: string): void {
    tty.text(colors.yellow(message) + '\n');
  },

  /**
   * Gray/muted message
   */
  muted(message: string): void {
    tty.text(colors.gray(message) + '\n');
  },

  /**
   * Bold text
   */
  bold(message: string): void {
    tty.text(colors.bold(message) + '\n');
  },

  /**
   * Section header with emoji
   */
  section(emoji: string, title: string): void {
    tty.text('\n' + colors.blue(`${emoji} ${title}`) + '\n');
  },

  /**
   * Status icon
   */
  statusIcon(status: 'pass' | 'warn' | 'fail' | string): string {
    switch (status) {
      case 'pass':
        return '✅';
      case 'warn':
        return '⚠️';
      case 'fail':
        return '❌';
      default:
        return '❓';
    }
  },

  // For advanced usage/one-off cases where a new method isn't necessary
  getTTY(): typeof tty {
    return tty;
  },
};
