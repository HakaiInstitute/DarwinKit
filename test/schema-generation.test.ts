import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { import_schema } from "@dwkt/core/import";

const PROJECT_ROOT = join(import.meta.dirname!, "..");
const SOURCE_DIR = join(PROJECT_ROOT, "external");
const OUTPUT_DIR = join(PROJECT_ROOT, "packages/domain/src/specs/generated");

interface RangeValidator {
  type: "range";
  params: { min: number; max: number };
  [key: string]: unknown;
}

interface FieldDef {
  obis_required?: string;
  validators?: (string | RangeValidator)[];
  [key: string]: unknown;
}

interface ProfileDef {
  fields: Record<string, FieldDef>;
  [key: string]: unknown;
}

type SchemaJson = Record<string, ProfileDef>;

function findRange(field: FieldDef): RangeValidator | undefined {
  return field.validators?.find(
    (v): v is RangeValidator => typeof v === "object" && v.type === "range",
  );
}

Deno.test("Schema generation", async (t) => {
  await Effect.runPromise(import_schema(SOURCE_DIR, OUTPUT_DIR));
  const text = await Deno.readTextFile(join(OUTPUT_DIR, "dwcSchema.json"));
  const schema = JSON.parse(text) as SchemaJson;

  await t.step("produces all expected profiles", () => {
    for (
      const name of [
        "Event",
        "Occurrence",
        "Taxon",
        "ExtendedMeasurementOrFact",
        "dnaDerivedData",
        "ResourceRelationship",
      ]
    ) {
      assertExists(schema[name], `Missing profile: ${name}`);
    }
  });

  await t.step("populates OBIS requirements", () => {
    const expectations: [string, string, string][] = [
      ["Event", "eventDate", "required"],
      ["Event", "decimalLatitude", "required"],
      ["Event", "year", "strongly recommended"],
      ["Event", "day", "recommended"],
      ["Occurrence", "basisOfRecord", "required"],
      ["Occurrence", "scientificName", "required"],
      ["ExtendedMeasurementOrFact", "measurementType", "strongly recommended"],
      ["ExtendedMeasurementOrFact", "eventID", "required"],
    ];
    for (const [profile, field, expected] of expectations) {
      assertEquals(
        schema[profile].fields[field].obis_required,
        expected,
        `${profile}.${field} should be ${expected}`,
      );
    }
  });

  await t.step("assigns range validators", () => {
    const expectations: [string, number, number][] = [
      ["decimalLatitude", -90, 90],
      ["decimalLongitude", -180, 180],
      ["year", 1600, new Date().getFullYear()],
      ["month", 1, 12],
      ["day", 1, 31],
    ];
    for (const [field, min, max] of expectations) {
      const range = findRange(schema.Event.fields[field]);
      assertExists(range, `${field} should have a range validator`);
      assertEquals(range.params.min, min, `${field} min`);
      assertEquals(range.params.max, max, `${field} max`);
    }
  });

  await t.step("assigns validators from OBIS requirement level", () => {
    const lat = schema.Event.fields.decimalLatitude;
    assertEquals(lat.validators!.includes("required"), true, "required fields get 'required'");
    const year = schema.Event.fields.year;
    assertEquals(
      year.validators!.includes("recommended"),
      true,
      "strongly recommended get 'recommended'",
    );
  });

  await t.step("assigns type-based validators", () => {
    const event = schema.Event.fields;
    assertEquals(event.modified.validators!.includes("iso8601Date"), true, "date fields");
    assertEquals(event.eventID.validators!.includes("uniqueIdentifier"), true, "ID fields");
  });
});
