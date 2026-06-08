/**
 * Generates darwinkit.schema.json from the Effect workspace configuration schema.
 *
 * Usage: deno task schema:generate
 */

import { join } from "@std/path";
import * as JsonSchema from "effect/JsonSchema";
import * as S from "effect/Schema";
import { workspaceConfigSchema } from "./workspace-config.ts";

// NOTE: v4's `toJsonSchemaDocument` renders every optional/defaulted field as
// `anyOf: [<schema>, { type: "null" }]` (the encoded `| undefined` has no JSON
// equivalent). The decoder actually rejects explicit `null` for those fields,
// so the emitted schema is slightly more permissive than the CLI for an IDE
// validating `*darwinkit.yaml`. We intentionally leave these branches: it is an
// IDE-hint-only divergence, and stripping `{ type: "null" }` generically would
// also remove the *legitimate* null from genuine unions such as the
// `transform.datasets[].fields` value (`string | number | null`), causing the
// IDE to reject valid configs.
const document = S.toJsonSchemaDocument(workspaceConfigSchema);

// `document.schema` is the root object node (without the definitions pool);
// `document.definitions` is the separate `$defs` map. Operate on both typed
// fields directly instead of casting the whole thing to a record.
const rootSchema = document.schema;

// Post-process: strip runtime-only fields that users shouldn't see in IDE suggestions.
const sourceProperties = (rootSchema.properties ?? {}) as Record<string, JsonSchema.JsonSchema>;
const properties: Record<string, JsonSchema.JsonSchema> = { ...sourceProperties };
delete properties.createdAt;
delete properties.updatedAt;

// Re-assemble a single self-contained Draft 2020-12 document:
// - stamp the meta-schema URI
// - spread the typed root object node
// - swap in the property map with runtime-only fields stripped
// - inline the separate definitions pool under `$defs`
// - add the anyOf constraint for the S.filter requirement
//   (at least one of validation or transform must be present)
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
