/**
 * Dataset Rule Validators
 *
 * SQL-based validators for dataset-level rules (rules that span multiple fields
 * or multiple datasets).
 *
 * @module validation/dataset-rule-validators
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

import type { OneOfRequiredRule } from "@dwkt/domain/specs";
import {
  type FieldViolation,
  OneOfRequiredViolation,
  requirementToSeverity,
} from "@dwkt/domain/types";

/**
 * Validates that at least one of the specified fields has a non-null, non-empty value
 * in each row of the table.
 *
 * Returns Effect.void when all rows pass, or fails with an array of violations
 * for rows where all specified fields are null or empty.
 */
export function validateOneOfRequired(
  connection: DuckDBConnection,
  tableName: string,
  rule: OneOfRequiredRule,
  maxViolations = 100,
): Effect.Effect<void, FieldViolation[]> {
  return Effect.gen(function* (_) {
    const fieldConditions = rule.fields.map((f) => {
      const asText = `CAST("${f}" AS VARCHAR)`;
      return `("${f}" IS NULL OR TRIM(${asText}) = '')`;
    });

    const query = `
      SELECT _row_number
      FROM ${tableName}
      WHERE ${fieldConditions.join(" AND ")}
      ORDER BY _row_number
      LIMIT ${maxViolations}
    `;

    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(
        Effect.orDie,
      ),
    );

    const rows = result.getRowObjects();
    if (rows.length > 0) {
      const fieldLabel = rule.fields.join(", ");
      const message = rule.message ??
        `At least one of [${rule.fields.join(", ")}] must be present`;
      const violations: FieldViolation[] = rows.map((row) =>
        new OneOfRequiredViolation({
          severity: requirementToSeverity(rule.level),
          fieldName: fieldLabel,
          targetName: fieldLabel,
          rowNumber: Number(row._row_number),
          value: "",
          errorMessage: message,
        })
      );
      return yield* _(Effect.fail(violations));
    }
  });
}
