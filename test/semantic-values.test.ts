/**
 * Tests for Consolidated Semantic Values
 *
 * Comprehensive test suite covering:
 * - Intrinsic validation (always-true rules)
 * - Structural equality (TaggedClass)
 * - Pattern matching (_tag)
 * - Transformation tracking
 * - Effect integration
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import {
  ControlledVocabularyValue,
  Coordinate,
  Description,
  getSemanticTypeName,
  Identifier,
  isSemanticValue,
  Measurement,
  ScientificName,
  TemporalValue,
  unwrap,
  validateIntrinsic,
} from "../packages/domain/src/types/semantic-values.ts";
import type { Transformation } from "../packages/domain/src/types/transformation.ts";

Deno.test("Coordinate - intrinsic validation", async (t) => {
  await t.step("Valid coordinate passes validation", async () => {
    const coord = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    const result = await Effect.runPromise(coord.validateIntrinsic());
    assertEquals(result, undefined); // Effect.void returns undefined
  });

  await t.step("Invalid latitude fails validation", async () => {
    const coord = new Coordinate({
      latitude: 95, // Invalid: > 90
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    const result = await Effect.runPromise(
      Effect.either(coord.validateIntrinsic()),
    );

    assertEquals(result._tag, "Left");
    if (result._tag === "Left") {
      assertExists(result.left);
      assertEquals(result.left._tag, "ValidationError");
      assertEquals(result.left.field, "latitude");
    }
  });

  await t.step("Invalid longitude fails validation", async () => {
    const coord = new Coordinate({
      latitude: 45.5,
      longitude: -200, // Invalid: < -180
      coordinateSystem: "WGS84",
    });

    const result = await Effect.runPromise(
      Effect.either(coord.validateIntrinsic()),
    );

    assertEquals(result._tag, "Left");
    if (result._tag === "Left") {
      assertExists(result.left);
      assertEquals(result.left._tag, "ValidationError");
      assertEquals(result.left.field, "longitude");
    }
  });

  await t.step("toString() formats correctly", () => {
    const coord = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    assertEquals(coord.toString(), "45.5, -122.6 (WGS84)");
  });

  await t.step("Structural equality works", () => {
    const coord1 = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    const coord2 = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    assertEquals(Equal.equals(coord1, coord2), true);
  });
});

Deno.test("TemporalValue - intrinsic validation", async (t) => {
  await t.step("Valid date passes validation", async () => {
    const temporal = new TemporalValue({
      date: new Date("2024-06-15"),
      precision: "day",
    });

    const result = await Effect.runPromise(temporal.validateIntrinsic());
    assertEquals(result, undefined);
  });

  await t.step("Invalid day fails validation", async () => {
    // Create a date and manually set invalid day (JavaScript Date allows this)
    const invalidDate = new Date("2024-06-01");
    // Manually set invalid day for testing
    (invalidDate as { getDate: () => number }).getDate = () => 35; // Invalid: > 31

    const temporal = new TemporalValue({
      date: invalidDate,
      precision: "day",
    });

    const result = await Effect.runPromise(
      Effect.either(temporal.validateIntrinsic()),
    );

    assertEquals(result._tag, "Left");
    if (result._tag === "Left") {
      assertExists(result.left);
      assertEquals(result.left._tag, "ValidationError");
    }
  });

  await t.step("toString() respects precision", () => {
    const date = new Date("2024-06-15T14:30:00Z");

    const yearPrecision = new TemporalValue({
      date,
      precision: "year",
    });
    assertEquals(yearPrecision.toString(), "2024");

    const monthPrecision = new TemporalValue({
      date,
      precision: "month",
    });
    assertEquals(monthPrecision.toString(), "2024-06");

    const dayPrecision = new TemporalValue({
      date,
      precision: "day",
    });
    assertEquals(dayPrecision.toString(), "2024-06-15");
  });
});

Deno.test("Identifier - no intrinsic validation", async (t) => {
  await t.step("All identifiers are valid intrinsically", async () => {
    const id = new Identifier({
      value: "ABC123",
      identifierType: "local",
    });

    const result = await Effect.runPromise(validateIntrinsic(id));
    assertEquals(result, undefined);
  });

  await t.step("Metadata accessors work", () => {
    const localId = new Identifier({
      value: "ABC123",
      identifierType: "local",
    });
    assertEquals(localId.isGloballyUnique, false);
    assertEquals(localId.isResolvable, false);

    const globalId = new Identifier({
      value: "urn:uuid:123",
      identifierType: "global",
    });
    assertEquals(globalId.isGloballyUnique, true);

    const uriId = new Identifier({
      value: "https://example.com/specimen/123",
      identifierType: "uri",
    });
    assertEquals(uriId.isGloballyUnique, true);
    assertEquals(uriId.isResolvable, true);
  });
});

Deno.test("ScientificName - hybrid validation", async (t) => {
  await t.step("Valid binomial name passes", async () => {
    const name = new ScientificName({
      scientificName: "Homo sapiens",
    });

    const result = await Effect.runPromise(name.validateIntrinsic());
    assertEquals(result, undefined);
  });

  await t.step("Invalid format fails", async () => {
    const name = new ScientificName({
      scientificName: "homo sapiens", // lowercase genus
    });

    const result = await Effect.runPromise(
      Effect.either(name.validateIntrinsic()),
    );

    assertEquals(result._tag, "Left");
  });

  await t.step("toString() includes authority if present", () => {
    const withoutAuthority = new ScientificName({
      scientificName: "Homo sapiens",
    });
    assertEquals(withoutAuthority.toString(), "Homo sapiens");

    const withAuthority = new ScientificName({
      scientificName: "Homo sapiens",
      authority: "Linnaeus, 1758",
    });
    assertEquals(withAuthority.toString(), "Homo sapiens [Linnaeus, 1758]");
  });
});

Deno.test("Measurement - intrinsic validation", async (t) => {
  await t.step("Finite numbers pass validation", async () => {
    const measurement = new Measurement({
      value: 42.5,
      unit: "meters",
    });

    const result = await Effect.runPromise(measurement.validateIntrinsic());
    assertEquals(result, undefined);
  });

  await t.step("Non-finite numbers fail validation", async () => {
    const infiniteMeasurement = new Measurement({
      value: Infinity,
      unit: "meters",
    });

    const result = await Effect.runPromise(
      Effect.either(infiniteMeasurement.validateIntrinsic()),
    );

    assertEquals(result._tag, "Left");
  });

  await t.step("toString() formats with unit", () => {
    const measurement = new Measurement({
      value: 42.5,
      unit: "meters",
      measurementType: "length",
    });

    assertEquals(measurement.toString(), "42.5 meters");
  });
});

Deno.test("Description - no intrinsic validation", async (t) => {
  await t.step("All descriptions are valid intrinsically", async () => {
    const description = new Description({
      text: "A detailed description of the specimen",
    });

    const result = await Effect.runPromise(validateIntrinsic(description));
    assertEquals(result, undefined);
  });

  await t.step("extractURIs() finds embedded links", () => {
    const description = new Description({
      text: "See https://example.com/specimen/123 and http://test.org for more info",
    });

    const uris = description.extractURIs();
    assertEquals(uris.length, 2);
    assertEquals(uris[0], "https://example.com/specimen/123");
    assertEquals(uris[1], "http://test.org");
  });
});

Deno.test("ControlledVocabularyValue - external validation", async (t) => {
  await t.step("No intrinsic validation", async () => {
    const vocab = new ControlledVocabularyValue({
      value: "PreservedSpecimen",
      vocabularyKey: "basisOfRecord",
      caseSensitive: true,
    });

    const result = await Effect.runPromise(validateIntrinsic(vocab));
    assertEquals(result, undefined);
  });

  await t.step("validateVocabulary() checks membership (case sensitive)", async () => {
    const vocab = new ControlledVocabularyValue({
      value: "PreservedSpecimen",
      vocabularyKey: "basisOfRecord",
      caseSensitive: true,
    });

    const allowedValues = ["PreservedSpecimen", "FossilSpecimen", "LivingSpecimen"];

    const result = await Effect.runPromise(vocab.validateVocabulary(allowedValues));
    assertEquals(result, undefined);
  });

  await t.step("validateVocabulary() rejects invalid values", async () => {
    const vocab = new ControlledVocabularyValue({
      value: "InvalidValue",
      vocabularyKey: "basisOfRecord",
      caseSensitive: true,
    });

    const allowedValues = ["PreservedSpecimen", "FossilSpecimen"];

    const result = await Effect.runPromise(
      Effect.either(vocab.validateVocabulary(allowedValues)),
    );

    assertEquals(result._tag, "Left");
  });

  await t.step("validateVocabulary() supports case insensitive", async () => {
    const vocab = new ControlledVocabularyValue({
      value: "preservedspecimen",
      vocabularyKey: "basisOfRecord",
      caseSensitive: false,
    });

    const allowedValues = ["PreservedSpecimen", "FossilSpecimen"];

    const result = await Effect.runPromise(vocab.validateVocabulary(allowedValues));
    assertEquals(result, undefined);
  });
});

Deno.test("Transformation tracking", async (t) => {
  await t.step("Transformations are stored and accessible", () => {
    const transformations: Transformation[] = [
      {
        category: "automatic",
        type: "whitespace_trim",
        description: "Removed leading/trailing whitespace",
      },
      {
        category: "explicit",
        function: "normalizeScientificName",
        description: "Normalized scientific name",
        parameters: { removeAuthors: true },
      },
    ];

    const id = new Identifier({
      value: "ABC123",
      identifierType: "local",
      sourceValue: "  abc123  ",
      transformations,
    });

    assertEquals(id.sourceValue, "  abc123  ");
    assertEquals(id.transformations?.length, 2);
    assertEquals(id.transformations?.[0].category, "automatic");
    if (id.transformations?.[0].category === "automatic") {
      assertEquals(id.transformations[0].type, "whitespace_trim");
    }
  });
});

Deno.test("Helper functions", async (t) => {
  await t.step("isSemanticValue() type guard works", () => {
    const coord = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    assertEquals(isSemanticValue(coord), true);
    assertEquals(isSemanticValue("not a semantic value"), false);
    assertEquals(isSemanticValue(42), false);
  });

  await t.step("getSemanticTypeName() returns _tag", () => {
    const coord = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    assertEquals(getSemanticTypeName(coord), "Coordinate");

    const id = new Identifier({
      value: "ABC123",
      identifierType: "local",
    });

    assertEquals(getSemanticTypeName(id), "Identifier");
  });

  await t.step("unwrap() extracts primitive values", () => {
    const coord = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });
    const unwrapped = unwrap(coord);
    assertEquals(unwrapped, { lat: 45.5, lon: -122.6 });

    const id = new Identifier({
      value: "ABC123",
      identifierType: "local",
    });
    assertEquals(unwrap(id), "ABC123");

    const description = new Description({
      text: "Test description",
    });
    assertEquals(unwrap(description), "Test description");

    // Pass-through for non-semantic values
    assertEquals(unwrap("plain string"), "plain string");
    assertEquals(unwrap(42), 42);
  });
});

Deno.test("Structural equality and pattern matching", async (t) => {
  await t.step("Two identical coordinates are equal", () => {
    const coord1 = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    const coord2 = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    assertEquals(Equal.equals(coord1, coord2), true);
  });

  await t.step("Different coordinates are not equal", () => {
    const coord1 = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    const coord2 = new Coordinate({
      latitude: 46.0,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    assertEquals(Equal.equals(coord1, coord2), false);
  });

  await t.step("_tag enables pattern matching", () => {
    const coord = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
    });

    const id = new Identifier({
      value: "ABC123",
      identifierType: "local",
    });

    assertEquals(coord._tag, "Coordinate");
    assertEquals(id._tag, "Identifier");

    // Pattern matching example
    function processValue(value: typeof coord | typeof id): string {
      switch (value._tag) {
        case "Coordinate":
          return `Location at ${value.latitude}, ${value.longitude}`;
        case "Identifier":
          return `ID: ${value.value}`;
      }
    }

    assertEquals(processValue(coord), "Location at 45.5, -122.6");
    assertEquals(processValue(id), "ID: ABC123");
  });
});

Deno.test("JSON serialization", async (t) => {
  await t.step("Coordinate serializes with _tag", () => {
    const coord = new Coordinate({
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
      sourceValue: "45.5, -122.6",
    });

    const json = coord.toJSON();
    assertEquals(json, {
      _tag: "Coordinate",
      latitude: 45.5,
      longitude: -122.6,
      coordinateSystem: "WGS84",
      sourceValue: "45.5, -122.6",
    });
  });

  await t.step("TemporalValue serializes date as ISO string", () => {
    const temporal = new TemporalValue({
      date: new Date("2024-06-15T00:00:00Z"),
      precision: "day",
    });

    const json = temporal.toJSON();
    assertEquals(json, {
      _tag: "TemporalValue",
      date: "2024-06-15T00:00:00.000Z",
      precision: "day",
      sourceValue: undefined,
    });
  });
});
