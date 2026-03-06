import * as Data from "effect/Data";
import type { RequirementLevel } from "./constraints.ts";

/**
 * Condition for when a dependency rule fires.
 *
 * - `string` — field presence: rule fires when the named field is non-null/non-empty
 * - `{ field, equals }` — value match: rule fires when field equals the value
 * - `{ field, in }` — set membership: rule fires when field value is in the set
 */
export type DependencyCondition =
  | string
  | { readonly field: string; readonly equals: string }
  | { readonly field: string; readonly in: readonly string[] };

/**
 * What must be present when the dependency fires.
 *
 * - `string[]` — all listed fields must be present
 * - `{ oneOf: string[] }` — at least one listed field must be present
 */
export type DependencyRequire =
  | readonly string[]
  | { readonly oneOf: readonly string[] };

export class DependencyRule extends Data.TaggedClass("dependency")<{
  readonly sourceDataset?: string;
  readonly when?: DependencyCondition;
  readonly require: DependencyRequire;
  readonly level: RequirementLevel;
  readonly message?: string;
}> {}

export type DatasetRule = DependencyRule;
