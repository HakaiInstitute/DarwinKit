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
 * Create a layer that sets the minimum log level
 *
 * @example
 * ```typescript
 * // Verbose mode - show all logs including debug
 * const program = myEffect.pipe(
 *   Effect.provide( LogLevelLayer(LogLevel.Debug))
 * );
 *
 * // Normal mode - only warnings and errors
 * const program = myEffect.pipe(
 *   Effect.provide( LogLevelLayer(LogLevel.Warning))
 * );
 * ```
 */
function LogLevelLayer(
  level: LogLevel.LogLevel,
): Layer.Layer<never, never, never> {
  return Logger.minimumLogLevel(level);
}

/**
 * Default log level layer (warning and above)
 */
export const DefaultLogLevel = LogLevelLayer(LogLevel.Warning);

/**
 * Verbose log level layer (debug and above)
 */
export const VerboseLogLevel = LogLevelLayer(LogLevel.Debug);

/**
 * Silent log level layer (no logs)
 */
export const SilentLogLevel = LogLevelLayer(LogLevel.None);
