/**
 * Logging Configuration
 *
 * Provides Effect-based logging configuration for DarwinKit.
 * Uses Effect's built-in logger with configurable minimum log level.
 *
 * @module logging
 */

import type * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as LogLevel from "effect/LogLevel";

/**
 * Log level type for external configuration
 */
export type LogLevelConfig = "debug" | "info" | "warning" | "error" | "silent";

/**
 * Convert string log level to Effect LogLevel
 */
export function toEffectLogLevel(level: LogLevelConfig): LogLevel.LogLevel {
  switch (level) {
    case "debug":
      return LogLevel.Debug;
    case "info":
      return LogLevel.Info;
    case "warning":
      return LogLevel.Warning;
    case "error":
      return LogLevel.Error;
    case "silent":
      return LogLevel.None;
    default:
      return LogLevel.Warning;
  }
}

/**
 * Create a layer that sets the minimum log level
 *
 * @example
 * ```typescript
 * // Verbose mode - show all logs including debug
 * const program = myEffect.pipe(
 *   Effect.provide(LogLevelLayer("debug"))
 * );
 *
 * // Normal mode - only warnings and errors
 * const program = myEffect.pipe(
 *   Effect.provide(LogLevelLayer("warning"))
 * );
 * ```
 */
export function LogLevelLayer(
  level: LogLevelConfig,
): Layer.Layer<never, never, never> {
  return Logger.minimumLogLevel(toEffectLogLevel(level));
}

/**
 * Default log level layer (warning and above)
 */
export const DefaultLogLevel = LogLevelLayer("warning");

/**
 * Verbose log level layer (debug and above)
 */
export const VerboseLogLevel = LogLevelLayer("debug");

/**
 * Silent log level layer (no logs)
 */
export const SilentLogLevel = LogLevelLayer("silent");
