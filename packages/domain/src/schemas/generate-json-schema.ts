/**
 * Generates darwinkit.schema.json from the Effect workspace configuration schema.
 *
 * Usage: deno run --allow-write packages/domain/src/schemas/generate-json-schema.ts
 */

import * as JSONSchema from "effect/JSONSchema";
import { workspaceConfigSchema } from "./workspace-config.ts";

const jsonSchema = JSONSchema.make(workspaceConfigSchema);

// Post-process: add anyOf constraint for the S.filter requirement
// (at least one of validation or transform must be present)
const schema = {
  ...jsonSchema,
  anyOf: [
    { required: ["validation"] },
    { required: ["transform"] },
  ],
};

const output = JSON.stringify(schema, null, 2) + "\n";
const outputPath = new URL("darwinkit.schema.json", import.meta.url);
await Deno.writeTextFile(outputPath, output);

console.log("Generated darwinkit.schema.json");
