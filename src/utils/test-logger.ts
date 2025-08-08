/**
 * Test Logger Utility
 *
 * A logging utility for demo and test files that bypasses ESLint console rules.
 * This should ONLY be used in demo/ and test/ directories.
 */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TestLoggerOptions {
  prefix?: string;
  enableColors?: boolean;
  enableTimestamps?: boolean;
}

class TestLogger {
  private prefix: string;
  private enableColors: boolean;
  private enableTimestamps: boolean;

  constructor(options: TestLoggerOptions = {}) {
    this.prefix = options.prefix ?? "";
    this.enableColors = options.enableColors ?? true;
    this.enableTimestamps = options.enableTimestamps ?? false;
  }

  private formatMessage(level: string, ...args: any[]): any[] {
    const timestamp = this.enableTimestamps ? `[${new Date().toISOString()}] ` : "";
    const prefix = this.prefix ? `[${this.prefix}] ` : "";
    const levelStr = this.enableColors ? this.colorize(level, level) : `[${level}]`;

    if (args.length > 0 && typeof args[0] === "string") {
      args[0] = `${timestamp}${prefix}${levelStr} ${args[0]}`;
    } else {
      args.unshift(`${timestamp}${prefix}${levelStr}`);
    }

    return args;
  }

  private colorize(text: string, level: string): string {
    if (!this.enableColors) return `[${text}]`;

    const colors: Record<string, string> = {
      LOG: "\x1b[0m", // Default
      INFO: "\x1b[36m", // Cyan
      SUCCESS: "\x1b[32m", // Green
      WARN: "\x1b[33m", // Yellow
      ERROR: "\x1b[31m", // Red
      DEBUG: "\x1b[35m", // Magenta
    };

    const color = colors[level] || colors.LOG;
    return `${color}[${text}]\x1b[0m`;
  }

  log(...args: any[]): void {
    // eslint-disable-next-line
    console.log(...this.formatMessage("LOG", ...args));
  }

  info(...args: any[]): void {
    // eslint-disable-next-line
    console.info(...this.formatMessage("INFO", ...args));
  }

  success(...args: any[]): void {
    // eslint-disable-next-line
    console.log(...this.formatMessage("SUCCESS", ...args));
  }

  warn(...args: any[]): void {
    // eslint-disable-next-line
    console.warn(...this.formatMessage("WARN", ...args));
  }

  error(...args: any[]): void {
    // eslint-disable-next-line
    console.error(...this.formatMessage("ERROR", ...args));
  }

  debug(...args: any[]): void {
    // eslint-disable-next-line
    console.debug(...this.formatMessage("DEBUG", ...args));
  }

  group(...args: any[]): void {
    // eslint-disable-next-line
    console.group(...args);
  }

  groupEnd(): void {
    console.groupEnd();
  }

  table(data: any, columns?: string[]): void {
    console.table(data, columns);
  }

  time(label: string): void {
    console.time(label);
  }

  timeEnd(label: string): void {
    console.timeEnd(label);
  }

  clear(): void {
    console.clear();
  }

  // Special formatting methods for demo output

  section(title: string): void {
    this.log(`\n${"=".repeat(50)}`);
    this.log(title);
    this.log(`${"=".repeat(50)}\n`);
  }

  subsection(title: string): void {
    this.log(`\n${"-".repeat(40)}`);
    this.log(title);
    this.log(`${"-".repeat(40)}`);
  }

  json(obj: any, indent = 2): void {
    this.log(JSON.stringify(obj, null, indent));
  }

  list(items: any[], bullet = "•"): void {
    items.forEach((item) => {
      this.log(`  ${bullet} ${item}`);
    });
  }

  progressBar(current: number, total: number, width = 30): string {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const bar = `[${"█".repeat(filled)}${" ".repeat(empty)}] ${percentage}%`;
    return bar;
  }

  status(success: boolean, message: string): void {
    const icon = success ? "✅" : "❌";
    this.log(`${icon} ${message}`);
  }

  warning(message: string): void {
    this.log(`⚠️  ${message}`);
  }

  check(condition: boolean, successMsg: string, failureMsg: string): void {
    if (condition) {
      this.status(true, successMsg);
    } else {
      this.status(false, failureMsg);
    }
  }
}

// Create default logger instance
const logger = new TestLogger();

// Export both the class and a default instance
export { TestLogger };
export default logger;

// Convenience functions that use the default logger
export const log = logger.log.bind(logger);
export const info = logger.info.bind(logger);
export const success = logger.success.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
export const debug = logger.debug.bind(logger);
export const section = logger.section.bind(logger);
export const subsection = logger.subsection.bind(logger);
export const json = logger.json.bind(logger);
export const list = logger.list.bind(logger);
export const status = logger.status.bind(logger);
export const warning = logger.warning.bind(logger);
export const check = logger.check.bind(logger);
