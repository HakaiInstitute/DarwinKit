import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { import_schema } from "@dwkt/core/import";

const PROJECT_ROOT = join(import.meta.dirname!, "..");
const SOURCE_DIR = join(PROJECT_ROOT, "external");
const OUTPUT_DIR = join(PROJECT_ROOT, "packages/domain/src/specs/generated");

interface RangeValidator {
  type: "range";
  enforcement: string;
  params: { min: number; max: number };
  message: string;
}

interface FieldDef {
  name: string;
  obis_required?: string;
  validators?: (string | RangeValidator)[];
  [key: string]: unknown;
}

interface ProfileDef {
  name: string;
  fields: Record<string, FieldDef>;
  [key: string]: unknown;
}

type SchemaJson = Record<string, ProfileDef>;

async function generateAndLoadSchema(): Promise<SchemaJson> {
  await Effect.runPromise(import_schema(SOURCE_DIR, OUTPUT_DIR));
  const text = await Deno.readTextFile(join(OUTPUT_DIR, "dwcSchema.json"));
  return JSON.parse(text) as SchemaJson;
}

function findRangeValidator(
  validators: (string | RangeValidator)[],
): RangeValidator | undefined {
  return validators.find(
    (v): v is RangeValidator => typeof v === "object" && v.type === "range",
  );
}

// Generate schema once for all tests
let schema: SchemaJson;

Deno.test({
  name: "Schema generation",
  fn: async (t) => {
    schema = await generateAndLoadSchema();

    await t.step("produces all expected profiles", () => {
      const expectedProfiles = [
        "Event",
        "Occurrence",
        "Taxon",
        "ExtendedMeasurementOrFact",
        "dnaDerivedData",
        "ResourceRelationship",
      ];
      for (const profile of expectedProfiles) {
        assertExists(schema[profile], `Missing profile: ${profile}`);
      }
    });

    await t.step("populates OBIS requirements on Event fields", () => {
      const event = schema.Event.fields;
      assertEquals(event.eventDate.obis_required, "required");
      assertEquals(event.decimalLatitude.obis_required, "required");
      assertEquals(event.decimalLongitude.obis_required, "required");
      assertEquals(event.eventID.obis_required, "required");
      assertEquals(event.year.obis_required, "strongly recommended");
      assertEquals(event.month.obis_required, "strongly recommended");
      assertEquals(event.day.obis_required, "recommended");
    });

    await t.step("populates OBIS requirements on Occurrence fields", () => {
      const occ = schema.Occurrence.fields;
      assertEquals(occ.basisOfRecord.obis_required, "required");
      assertEquals(occ.scientificName.obis_required, "required");
      assertEquals(occ.occurrenceStatus.obis_required, "required");
      assertEquals(occ.eventID.obis_required, "required");
      assertEquals(occ.occurrenceID.obis_required, "required");
    });

    await t.step("populates OBIS requirements on eMoF fields", () => {
      const emof = schema.ExtendedMeasurementOrFact.fields;
      assertEquals(emof.measurementType.obis_required, "strongly recommended");
      assertEquals(emof.measurementValue.obis_required, "strongly recommended");
      assertEquals(emof.eventID.obis_required, "required");
      assertEquals(emof.occurrenceID.obis_required, "required");
    });

    await t.step("assigns range validator for decimalLatitude", () => {
      const lat = schema.Event.fields.decimalLatitude;
      const range = findRangeValidator(lat.validators!);
      assertExists(range, "decimalLatitude should have a range validator");
      assertEquals(range.params.min, -90);
      assertEquals(range.params.max, 90);
    });

    await t.step("assigns range validator for decimalLongitude", () => {
      const lng = schema.Event.fields.decimalLongitude;
      const range = findRangeValidator(lng.validators!);
      assertExists(range, "decimalLongitude should have a range validator");
      assertEquals(range.params.min, -180);
      assertEquals(range.params.max, 180);
    });

    await t.step("assigns range validator for year", () => {
      const year = schema.Event.fields.year;
      const range = findRangeValidator(year.validators!);
      assertExists(range, "year should have a range validator");
      assertEquals(range.params.min, 1600);
      assertEquals(range.params.max, new Date().getFullYear());
    });

    await t.step("assigns range validator for month", () => {
      const month = schema.Event.fields.month;
      const range = findRangeValidator(month.validators!);
      assertExists(range, "month should have a range validator");
      assertEquals(range.params.min, 1);
      assertEquals(range.params.max, 12);
    });

    await t.step("assigns range validator for day", () => {
      const day = schema.Event.fields.day;
      const range = findRangeValidator(day.validators!);
      assertExists(range, "day should have a range validator");
      assertEquals(range.params.min, 1);
      assertEquals(range.params.max, 31);
    });

    await t.step("assigns type-based validators", () => {
      const event = schema.Event.fields;
      assertEquals(
        event.modified.validators!.includes("iso8601Date"),
        true,
        "date-typed fields should have iso8601Date validator",
      );
      assertEquals(
        event.eventID.validators!.includes("uniqueIdentifier"),
        true,
        "eventID should have uniqueIdentifier validator",
      );
    });

    await t.step("assigns required validator when obis_required is 'required'", () => {
      const lat = schema.Event.fields.decimalLatitude;
      assertEquals(
        lat.validators!.includes("required"),
        true,
        "required OBIS fields should have 'required' validator",
      );
    });

    await t.step(
      "assigns recommended validator when obis_required is 'strongly recommended'",
      () => {
        const year = schema.Event.fields.year;
        assertEquals(
          year.validators!.includes("recommended"),
          true,
          "strongly recommended OBIS fields should have 'recommended' validator",
        );
      },
    );
  },
});
