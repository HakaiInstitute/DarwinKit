import { tty } from '@cliffy/ansi/tty';
import { colors } from '@cliffy/ansi/colors';

export const Output = {
  write(text: string, newline = false): void {
    tty.text(text);
    if (newline) {
      tty.text('\n');
    }
  },

  line(text = ''): void {
    tty.text(text + '\n');
  },

  blank(): void {
    tty.text('\n');
  },

  clearLine(): void {
    tty.eraseLine();
  },

  info(message: string): void {
    tty.text(colors.blue(message) + '\n');
  },

  success(message: string): void {
    tty.text(colors.green(message) + '\n');
  },

  error(message: string): void {
    tty.text(colors.red(message) + '\n');
  },

  warning(message: string): void {
    tty.text(colors.yellow(message) + '\n');
  },

  muted(message: string): void {
    tty.text(colors.gray(message) + '\n');
  },

  bold(message: string): void {
    tty.text(colors.bold(message) + '\n');
  },

  section(emoji: string, title: string): void {
    tty.text('\n' + colors.blue(`${emoji} ${title}`) + '\n');
  },

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

  updateLine(text: string): void {
    tty.cursorLeft.eraseLine.text(text);
  },

  saveCursor(): void {
    tty.cursorSave();
  },

  restoreCursor(): void {
    tty.cursorRestore();
  },

  cursorUp(lines = 1): void {
    tty.cursorUp(lines);
  },

  cursorDown(lines = 1): void {
    tty.cursorDown(lines);
  },
};
