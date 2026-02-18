// Convert Darwin Core XML schemas to JSON
//
// Run via CLI:
//  deno task cli import
//

import { parse as parseCsv } from "@std/csv";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { parse as parseXml, simplifyLostLess } from "txml";

const obisChecklistUrl =
  "https://raw.githubusercontent.com/iobis/manual/master/docs/OBIS-termchecklist.csv";

// ============================================================================
// Types
// ============================================================================

interface ThesaurusConcept {
  names: string[];
  [key: string]: unknown;
}

interface Thesaurus {
  concept: Record<string, ThesaurusConcept>;
  [key: string]: unknown;
}

interface FieldDefinition {
  group?: string;
  name: string;
  label: string;
  gbif_required?: string;
  obis_required?: string;
  unique?: string;
  type?: string;
  thesaurus?: string;
  values?: Record<string, ThesaurusConcept>;
  validators?: (string | RangeValidator)[];
  [key: string]: unknown;
}

interface SchemaTable {
  name: string;
  fieldOverrides: Record<string, unknown>;
  fields: Record<string, FieldDefinition>;
  [key: string]: unknown;
}

interface SchemaJson {
  [tableName: string]: SchemaTable;
}

interface OBISChecklistRow {
  Term: string;
  "Event Table"?: string;
  "Occurrence Extension"?: string;
  "eMoF Table"?: string;
  "DNA Table"?: string;
  "OBIS Required"?: string;
  [key: string]: string | undefined;
}

interface RangeValidator {
  type: "range";
  params: { min: number; max: number };
  message: string;
}

interface Options {
  group?: string;
  idFieldName: string;
}

// ============================================================================
// XML Parsing with txml
// ============================================================================

/**
 * Helper to get array value from txml simplified structure.
 * txml wraps repeated elements in arrays, this unwraps them.
 */
function getArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Extract thesaurus vocabulary from XML file.
 *
 * Maps thesaurus URLs to local files, parses XML, and extracts controlled vocabulary values.
 */
function xmlThesaurusToJson(inputID: string, externalDir: string): Thesaurus {
  const thesaurusPath = inputID
    .replace("http://rs.gbif.org/", `${externalDir}/rs_gbif/`)
    .replace("https://rs.gbif.org/", `${externalDir}/rs_gbif/`);

  Effect.logInfo(`    Getting vocabulary from ${thesaurusPath}`);

  const thesaurusXml = Deno.readTextFileSync(thesaurusPath);
  // Remove voc: namespace prefix for easier parsing
  const cleanedXml = thesaurusXml
    .replaceAll("<voc:", "<")
    .replaceAll("</voc:", "</");

  const parsed = parseXml(cleanedXml);
  // deno-lint-ignore no-explicit-any
  const simplified = simplifyLostLess(parsed as any) as any;

  // Extract concepts from simplified XML
  const thesaurusData = simplified.thesaurus[0];
  const concepts: Record<string, ThesaurusConcept> = {};

  // deno-lint-ignore no-explicit-any
  getArray(thesaurusData.concept).forEach((concept: any) => {
    const identifier = concept._attributes["dc:identifier"];
    if (!identifier) return;

    // Extract English terms from preferred and alternative labels
    const altRepresentations: string[] = [];

    // Process preferred terms
    // deno-lint-ignore no-explicit-any
    getArray(concept.preferred).forEach((pref: any) => {
      // deno-lint-ignore no-explicit-any
      getArray(pref.term).forEach((term: any) => {
        const attrs = term._attributes;
        if (attrs && attrs["xml:lang"] === "en" && attrs["dc:title"]) {
          altRepresentations.push(attrs["dc:title"]);
        }
      });
    });

    // Process alternative terms
    // deno-lint-ignore no-explicit-any
    getArray(concept.alternative).forEach((alt: any) => {
      // deno-lint-ignore no-explicit-any
      getArray(alt.term).forEach((term: any) => {
        const attrs = term._attributes;
        if (attrs && attrs["xml:lang"] === "en" && attrs["dc:title"]) {
          altRepresentations.push(attrs["dc:title"]);
        }
      });
    });

    // Copy attributes except identifier
    const { "dc:identifier": _, ...restAttrs } = concept._attributes;
    concepts[identifier] = {
      ...restAttrs,
      names: altRepresentations.filter(Boolean),
    };
  });

  // Extract thesaurus-level attributes (skip the concept array)
  const { concept: _concepts, ...thesaurusAttrs } = thesaurusData._attributes || {};

  return {
    ...thesaurusAttrs,
    concept: concepts,
  };
}

/**
 * Convert Darwin Core XML schema to JSON format.
 *
 * Parses XML extension/core definitions and extracts field properties.
 */
function xmlSchemaToJson(filePath: string, options: Options, externalDir: string): SchemaJson {
  const { group, idFieldName } = options;
  Effect.logInfo(`Reading Schema file ${filePath}`);

  const inputXML = Deno.readTextFileSync(filePath);
  const parsed = parseXml(inputXML);
  // deno-lint-ignore no-explicit-any
  const simplified = simplifyLostLess(parsed as any) as any;

  // Get extension or core element (they're wrapped in arrays)
  const extension = simplified.extension?.[0] || simplified.core?.[0];
  if (!extension) {
    throw new Error(`No extension or core element found in ${filePath}`);
  }

  const extensionName = extension._attributes?.name || "Unknown";

  // Extract field properties from property elements
  const fields: Record<string, FieldDefinition> = {};
  // deno-lint-ignore no-explicit-any
  getArray(extension.property).forEach((prop: any) => {
    const attrs = prop._attributes;
    if (!attrs) return;

    const name = attrs.name;
    if (!name) return;

    // Generate human-readable label from camelCase name
    let label = name.split(/(?<![A-Z])(?=[A-Z])/).join(" ");
    label = label[0].toUpperCase() + label.slice(1);

    // Build field definition with all attributes
    const field: FieldDefinition = {
      group: group || attrs.group || undefined,
      name,
      label,
      gbif_required: attrs.required || undefined,
      ...attrs, // Spread all other attributes
    };

    // Remove the properties we've already handled
    delete field.required;
    delete field.group; // Already handled above

    const thesaurus = attrs.thesaurus;
    // deno-lint-ignore no-explicit-any
    delete (field as any).thesaurus; // Will add back if needed

    // Add thesaurus vocabulary if present
    if (thesaurus) {
      const thesaurusJson = xmlThesaurusToJson(thesaurus, externalDir);
      field.thesaurus = thesaurus;
      field.values = thesaurusJson.concept;
      if (!field.type) {
        field.type = "controlled-vocabulary";
      }
    }

    // Set identifier type for ID fields
    if (name === idFieldName) {
      field.unique = "true";
      field.type = "identifier";
    } else if (!field.type && name.endsWith("ID")) {
      field.type = "identifier";
    }

    fields[name] = field;
  });

  // Extract extension/core metadata (skip name and property array)
  const { name: _name, ...extensionAttrs } = extension._attributes || {};

  return {
    [extensionName]: {
      ...extensionAttrs,
      name: extensionName,
      fieldOverrides: {},
      fields,
    },
  };
}

// ============================================================================
// OBIS Checklist Integration
// ============================================================================

/**
 * Fetch and parse OBIS checklist CSV.
 */
async function fetchObisChecklist(): Promise<OBISChecklistRow[]> {
  Effect.logInfo("Fetching OBIS checklist...");

  const response = await fetch(obisChecklistUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${obisChecklistUrl}: ${response.statusText}`);
  }

  const csvText = await response.text();
  // Remove non-ASCII characters (intentional control characters in regex)
  // deno-lint-ignore no-control-regex
  const cleanedCsv = csvText.replace(/[^\x00-\x7F]/g, "");

  // Parse CSV using Deno standard library
  const rawRecords = parseCsv(cleanedCsv, {
    skipFirstRow: true,
    trimLeadingSpace: true,
  }) as Record<string, string>[];

  // Trim whitespace from all keys and values — the OBIS checklist CSV
  // has spaces around headers and values that @std/csv preserves
  const records = rawRecords.map((row) => {
    const trimmed: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      trimmed[key.trim()] = typeof value === "string" ? value.trim() : value;
    }
    return trimmed;
  }) as OBISChecklistRow[];

  return records;
}

/**
 * Join OBIS checklist requirements with schema fields.
 */
function joinObisRequirements(
  schemaJson: SchemaJson,
  obisChecklist: OBISChecklistRow[],
): void {
  Effect.logInfo("    Joining OBIS checklist with schema");

  obisChecklist.forEach((item) => {
    const term = item.Term;

    // Determine which tables this term applies to
    const affectedTables: string[] = [];
    if (item["Event Table"]) affectedTables.push("Event");
    if (item["Occurrence Extension"]) affectedTables.push("Occurrence");
    if (item["eMoF Table"]) affectedTables.push("ExtendedMeasurementOrFact");
    if (item["DNA Table"]) affectedTables.push("dnaDerivedData");

    // Apply OBIS requirements to matching fields
    Object.keys(schemaJson).forEach((tableName) => {
      const table = schemaJson[tableName];
      const field = table.fields[term];

      if (field) {
        field.obis_required = affectedTables.includes(tableName)
          ? item["OBIS Required"]
          : "optional";
      }
    });
  });
}

// ============================================================================
// Validator Assignment
// ============================================================================

/**
 * Assign validators to fields based on field attributes and naming patterns.
 */
function assignValidators(schemaJson: SchemaJson): void {
  Effect.logInfo("Assign Validators");

  const currentYear = new Date().getFullYear();

  Object.values(schemaJson).forEach((table) => {
    Object.values(table.fields).forEach((field) => {
      const validators: (string | RangeValidator)[] = [];

      // Required validators
      if (
        field.obis_required === "required" ||
        field.obis_required === "required (if exists)"
      ) {
        validators.push("required");
      }

      // Type-based validators
      if (field.unique === "true") validators.push("uniqueIdentifier");
      if (field.type === "integer") validators.push("integer");
      if (field.type === "date") validators.push("iso8601Date");
      if (field.type === "uri") validators.push("url");

      // Name-based validators
      if (field.name.includes("latitude")) validators.push("latitude");
      if (field.name.includes("longitude")) validators.push("longitude");

      // Range validators for well-known fields
      if (field.name === "decimalLatitude") {
        validators.push({
          type: "range",
          params: { min: -90, max: 90 },
          message: "Latitude must be between -90 and +90 degrees",
        });
      }
      if (field.name === "decimalLongitude") {
        validators.push({
          type: "range",
          params: { min: -180, max: 180 },
          message: "Longitude must be between -180 and +180 degrees",
        });
      }
      if (field.name === "year") {
        validators.push({
          type: "range",
          params: { min: 1600, max: currentYear },
          message: "Year must be between 1600 and current year",
        });
      }
      if (field.name === "month") {
        validators.push({
          type: "range",
          params: { min: 1, max: 12 },
          message: "Month must be between 1 and 12",
        });
      }
      if (field.name === "day") {
        validators.push({
          type: "range",
          params: { min: 1, max: 31 },
          message: "Day must be between 1 and 31",
        });
      }

      field.validators = validators;
    });
  });
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Import Darwin Core schemas and generate combined JSON schema file.
 *
 * This function:
 * 1. Parses multiple Darwin Core XML schemas (Event, Occurrence, Taxon, etc.)
 * 2. Fetches OBIS checklist and applies requirements
 * 3. Assigns validators based on field types and patterns
 * 4. Writes final schema to outputDir/dwcSchema.json
 *
 * @param sourceDir - Path to the directory containing XML schemas (rs_gbif/)
 * @param outputDir - Path to the directory where generated files are written
 */
export function import_schema(sourceDir: string, outputDir: string): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    // Build XML file paths
    const exMoFxml = join(
      sourceDir,
      "rs_gbif/extension/obis/extended_measurement_or_fact_2023-08-28.xml",
    );
    const eventXml = join(sourceDir, "rs_gbif/core/dwc_event_2025-07-10.xml");
    const occurrenceXml = join(sourceDir, "rs_gbif/core/dwc_occurrence_2025-07-10.xml");
    const taxonXml = join(sourceDir, "rs_gbif/core/dwc_taxon_2025-07-10.xml");
    const DNAXml = join(
      sourceDir,
      "rs_gbif/extension/gbif/1.0/dna_derived_data_2024-07-11.xml",
    );
    const relatedXml = join(
      sourceDir,
      "rs_gbif/extension/dwc/resource_relationship_2025-07-10.xml",
    );

    // Parse all XML schemas
    const exMoFjson = xmlSchemaToJson(
      exMoFxml,
      {
        group: "ExtendedMeasurementOrFact",
        idFieldName: "measurementID",
      },
      sourceDir,
    );
    const eventJson = xmlSchemaToJson(eventXml, { idFieldName: "eventID" }, sourceDir);
    const occurrenceJson = xmlSchemaToJson(
      occurrenceXml,
      { idFieldName: "occurrenceID" },
      sourceDir,
    );
    const taxonJson = xmlSchemaToJson(taxonXml, { idFieldName: "taxonID" }, sourceDir);
    const DNAJson = xmlSchemaToJson(
      DNAXml,
      {
        group: "dnaDerivedData",
        idFieldName: "samp_name",
      },
      sourceDir,
    );
    const relatedJson = xmlSchemaToJson(
      relatedXml,
      {
        group: "ResourceRelationship",
        idFieldName: "resourceRelationshipID",
      },
      sourceDir,
    );

    // Combine all schemas
    const schemaJson: SchemaJson = {
      ...exMoFjson,
      ...eventJson,
      ...occurrenceJson,
      ...taxonJson,
      ...DNAJson,
      ...relatedJson,
    };

    // Fetch and apply OBIS requirements
    const obisChecklist = yield* Effect.promise(() => fetchObisChecklist());

    Effect.logInfo("    Writing OBIS checklist to file");
    const obisChecklistPath = join(outputDir, "obisChecklist.json");
    yield* Effect.promise(() =>
      Deno.writeTextFile(
        obisChecklistPath,
        JSON.stringify(obisChecklist, null, 2),
      )
    );

    // Apply OBIS requirements and assign validators
    joinObisRequirements(schemaJson, obisChecklist);
    assignValidators(schemaJson);

    // Write final schema
    const schemaPath = join(outputDir, "dwcSchema.json");
    yield* Effect.promise(() =>
      Deno.writeTextFile(schemaPath, JSON.stringify(schemaJson, null, 2))
    );

    Effect.logInfo(`Schema with OBIS checklist written to ${schemaPath}`);
  });
}
