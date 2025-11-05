/**
 * CLI Output utilities using Cliffy TTY for better terminal control
 */

import { tty } from '@cliffy/ansi/tty';
import { colors } from '@cliffy/ansi/colors';

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
    tty.text(text + '\n');
  },

  /**
   * Write blank line
   */
  blank(): void {
    tty.text('\n');
  },

  /**
   * Clear the current line
   */
  clearLine(): void {
    tty.eraseLine();
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

  /**
   * Update current line (useful for progress)
   */
  updateLine(text: string): void {
    tty.cursorLeft.eraseLine.text(text);
  },

  /**
   * Save cursor position
   */
  saveCursor(): void {
    tty.cursorSave();
  },

  /**
   * Restore cursor position
   */
  restoreCursor(): void {
    tty.cursorRestore();
  },

  /**
   * Move cursor up N lines
   */
  cursorUp(lines = 1): void {
    tty.cursorUp(lines);
  },

  /**
   * Move cursor down N lines
   */
  cursorDown(lines = 1): void {
    tty.cursorDown(lines);
  },
};
