import { tty } from '@cliffy/ansi/tty';
import { colors } from '@cliffy/ansi/colors';

export const Output = {
  line(text = ''): void {
    tty.text(text + '\n');
  },

  blank(): void {
    tty.text('\n');
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
};
