/**
 * DIAGNOSTIC (scratch) — investigate whether `stripNullBranches` is necessary.
 *
 * Observes:
 *  1. Raw `Schema.toJsonSchemaDocument` output — where do `{type:"null"}` branches appear?
 *  2. Whether the legacy `JSONSchema.make` (if it exists in v4) produces them.
 *  3. Whether the runtime decoder actually REJECTS explicit `null` for those fields.
 */

import * as Schema from "effect/Schema";
import * as JsonSchema from "effect/JsonSchema";
import { workspaceConfigSchema } from "./workspace-config.ts";

// ---------------------------------------------------------------------------
// 1. Raw toJsonSchemaDocument output — find every null branch.
// ---------------------------------------------------------------------------
const doc = Schema.toJsonSchemaDocument(workspaceConfigSchema);

type NullHit = { path: string; siblings: string[]; anyOfLen: number };
const hits: NullHit[] = [];

function isPureNull(m: unknown): boolean {
  return !!m && typeof m === "object" && !Array.isArray(m) &&
    (m as Record<string, unknown>).type === "null" &&
    Object.keys(m as Record<string, unknown>).length === 1;
}

function walk(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const key of ["anyOf", "oneOf", "allOf"]) {
      const arr = obj[key];
      if (Array.isArray(arr) && arr.some(isPureNull)) {
        hits.push({
          path: `${path}.${key}`,
          siblings: Object.keys(obj).filter((k) => k !== key),
          anyOfLen: arr.length,
        });
      }
    }
    for (const [k, v] of Object.entries(obj)) walk(v, `${path}.${k}`);
  }
}

walk(doc.schema, "schema");
walk(doc.definitions, "definitions");

console.log("=== toJsonSchemaDocument: null-branch hits ===");
console.log("total hits:", hits.length);
for (const h of hits) {
  console.log(`  ${h.path}  (anyOf len=${h.anyOfLen}, siblings=[${h.siblings.join(",")}])`);
}

// Show the raw shape of a couple representative top-level optional/defaulted props.
const props = (doc.schema as { properties?: Record<string, unknown> }).properties ?? {};
console.log("\n=== raw shapes of representative top-level props ===");
for (const name of ["description", "name", "datasetRules", "validation", "standard"]) {
  console.log(`  ${name}:`, JSON.stringify(props[name]));
}

// ---------------------------------------------------------------------------
// 2. Does the legacy JSONSchema.make exist in v4, and does IT emit null branches?
// ---------------------------------------------------------------------------
console.log("\n=== effect/JsonSchema exports (looking for make / fromAST) ===");
console.log(Object.keys(JsonSchema).sort().join(", "));

// ---------------------------------------------------------------------------
// 2b. Does the alternative single-schema emitter also emit null branches?
// ---------------------------------------------------------------------------
const single = JsonSchema.fromSchemaDraft2020_12(workspaceConfigSchema) as unknown;
const singleHits: NullHit[] = [];
{
  const save = hits.length;
  // reuse walk by temporarily swapping the array
  const tmp: NullHit[] = [];
  (function walk2(node: unknown, path: string): void {
    if (Array.isArray(node)) return node.forEach((n, i) => walk2(n, `${path}[${i}]`));
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const a = obj.anyOf;
      if (Array.isArray(a) && a.some(isPureNull)) {
        tmp.push({
          path,
          siblings: Object.keys(obj).filter((k) => k !== "anyOf"),
          anyOfLen: a.length,
        });
      }
      for (const [k, v] of Object.entries(obj)) walk2(v, `${path}.${k}`);
    }
  })(single, "single");
  singleHits.push(...tmp);
  void save;
}
console.log("\n=== fromSchemaDraft2020_12: null-branch hits ===", singleHits.length);

// ---------------------------------------------------------------------------
// 3. Does the decoder actually REJECT explicit null for these fields?
// ---------------------------------------------------------------------------
const decodes = (input: unknown): boolean => {
  const r = Schema.decodeUnknownResult(workspaceConfigSchema)(input) as { _tag: string };
  return r._tag === "Success";
};

console.log("\n=== decoder behaviour on explicit null (optional/defaulted top-level) ===");
const base = { validation: {} }; // minimal valid config
for (
  const field of ["description", "name", "version", "id", "standard", "datasetRules", "validation"]
) {
  const input = { ...base, [field]: null } as Record<string, unknown>;
  console.log(`  ${field}: null -> ${decodes(input) ? "ACCEPTED" : "REJECTED"}`);
}

console.log("\n=== the INTENTIONAL-null case: transform.datasets[].fields value ===");
// fields: Record<string, string | number | null> — null IS a valid value here.
const tfBase = {
  transform: {
    inputs: {},
    datasets: [{ name: "d", class: "Event", fields: { someField: null } }],
    output: { outputDir: "./out", exportDB: false },
  },
};
console.log(
  `  transform.datasets[].fields.someField: null -> ${decodes(tfBase) ? "ACCEPTED" : "REJECTED"}`,
);
