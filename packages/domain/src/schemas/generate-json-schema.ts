/**
 * Generates darwinkit.schema.json from the Effect workspace configuration schema.
 *
 * Usage: deno task schema:generate
 */

import { join } from "@std/path";
import * as JsonSchema from "effect/JsonSchema";
import * as S from "effect/Schema";
import { workspaceConfigSchema } from "./workspace-config.ts";

// Optional/defaulted fields render as `anyOf: [<schema>, { type: "null" }]`,
// slightly more permissive than the decoder (IDE-hint only). Left as-is:
// stripping `{ type: "null" }` generically would also drop legitimate nulls
// from genuine unions (e.g. `transform.datasets[].fields`).
const document = S.toJsonSchemaDocument(workspaceConfigSchema);

// `document.schema` is the root object node; `document.definitions` is the `$defs` map.
const rootSchema = document.schema;

// Post-process: strip runtime-only fields that users shouldn't see in IDE suggestions.
const sourceProperties = (rootSchema.properties ?? {}) as Record<string, JsonSchema.JsonSchema>;
const properties: Record<string, JsonSchema.JsonSchema> = { ...sourceProperties };
delete properties.createdAt;
delete properties.updatedAt;

// Re-assemble a self-contained Draft 2020-12 document with runtime-only fields
// stripped and the "at least one of validation/transform" anyOf constraint.
const schema: JsonSchema.JsonSchema = {
  $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
  ...rootSchema,
  properties,
  ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {}),
  anyOf: [
    { required: ["validation"] },
    { required: ["transform"] },
  ],
};

const output = JSON.stringify(schema, null, 2) + "\n";
const outputPath = join(import.meta.dirname!, "../specs/generated/darwinkit.schema.json");
await Deno.writeTextFile(outputPath, output);

console.log(`Generated ${outputPath}`);
