import * as Data from "effect/Data";
import type { RequirementLevel } from "./constraints.ts";

export class OneOfRequiredRule extends Data.TaggedClass("oneOfRequired")<{
  readonly fields: readonly string[];
  readonly level: RequirementLevel;
  readonly message?: string;
}> {}

export type DatasetRule = OneOfRequiredRule;
