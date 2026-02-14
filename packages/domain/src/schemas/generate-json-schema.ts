/**
 * Generates darwinkit.schema.json from the Effect workspace configuration schema.
 *
 * Usage: deno task schema:generate
 */

import * as JSONSchema from "effect/JSONSchema";
import { join } from "@std/path";
import { workspaceConfigSchema } from "./workspace-config.ts";

const jsonSchema = JSONSchema.make(workspaceConfigSchema) as unknown as Record<string, unknown>;

// Post-process: strip runtime-only fields that users shouldn't see in IDE suggestions
const properties = { ...(jsonSchema.properties as Record<string, unknown>) };
delete properties.createdAt;
delete properties.updatedAt;

// Add anyOf constraint for the S.filter requirement
// (at least one of validation or transform must be present)
const schema = {
  ...jsonSchema,
  properties,
  anyOf: [
    { required: ["validation"] },
    { required: ["transform"] },
  ],
};

const output = JSON.stringify(schema, null, 2) + "\n";
const outputPath = join(Deno.cwd(), "darwinkit.schema.json");
await Deno.writeTextFile(outputPath, output);

console.log("Generated darwinkit.schema.json");
