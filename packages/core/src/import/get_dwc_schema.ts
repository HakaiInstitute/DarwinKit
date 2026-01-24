// Convert Darwin Core XML schemas to JSON
//
// Run via CLI:
//  deno task dev:cli import
//

import { parse as parseCsv } from "@std/csv";
import { dirname, fromFileUrl, join } from "@std/path";
import { parse as parseXml, simplifyLostLess } from "txml";

// Resolve external directory relative to this module
const moduleDir = dirname(fromFileUrl(import.meta.url));
const externalDir = join(moduleDir, "..", "..", "..", "..", "external");

// XML file paths
const exMoFxml = join(
  externalDir,
  "rs_gbif/extension/obis/extended_measurement_or_fact_2023-08-28.xml",
);
const eventXml = join(externalDir, "rs_gbif/core/dwc_event_2025-07-10.xml");
const occurrenceXml = join(externalDir, "rs_gbif/core/dwc_occurrence_2025-07-10.xml");
const taxonXml = join(externalDir, "rs_gbif/core/dwc_taxon_2025-07-10.xml");
const DNAXml = join(
  externalDir,
  "rs_gbif/extension/gbif/1.0/dna_derived_data_2024-07-11.xml",
);

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
  validators?: string[];
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
  "eMoF DNA Table"?: string;
  "OBIS Required"?: string;
  [key: string]: string | undefined;
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
function xmlThesaurusToJson(inputID: string): Thesaurus {
  const thesaurusPath = inputID
    .replace("http://rs.gbif.org/", `${externalDir}/rs_gbif/`)
    .replace("https://rs.gbif.org/", `${externalDir}/rs_gbif/`);

  console.log(`    Getting vocabulary from ${thesaurusPath}`);

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
function xmlSchemaToJson(filePath: string, options: Options): SchemaJson {
  const { group, idFieldName } = options;
  console.log(`Reading Schema file ${filePath}`);

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
      const thesaurusJson = xmlThesaurusToJson(thesaurus);
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
  console.log("Fetching OBIS checklist...");

  const response = await fetch(obisChecklistUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${obisChecklistUrl}: ${response.statusText}`);
  }

  const csvText = await response.text();
  // Remove non-ASCII characters (intentional control characters in regex)
  // deno-lint-ignore no-control-regex
  const cleanedCsv = csvText.replace(/[^\x00-\x7F]/g, "");

  // Parse CSV using Deno standard library
  const records = parseCsv(cleanedCsv, {
    skipFirstRow: true,
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
  console.log("    Joining OBIS checklist with schema");

  obisChecklist.forEach((item) => {
    const term = item.Term;

    // Determine which tables this term applies to
    const affectedTables: string[] = [];
    if (item["Event Table"]) affectedTables.push("Event");
    if (item["Occurrence Extension"]) affectedTables.push("Occurrence");
    if (item["eMoF Table"]) affectedTables.push("ExtendedMeasurementOrFact");
    if (item["eMoF DNA Table"]) affectedTables.push("dnaDerivedData");

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
  console.log("Assign Validators");

  Object.values(schemaJson).forEach((table) => {
    Object.values(table.fields).forEach((field) => {
      const validators: string[] = [];

      // Required validators
      if (
        field.obis_required === "required" ||
        field.obis_required === "required (if exists)"
      ) {
        validators.push("required");
      }

      // Recommended validators
      if (
        field.obis_required === "recommended" ||
        field.obis_required === "strongly recommended"
      ) {
        validators.push("recommended");
      }

      // Type-based validators
      if (field.unique === "true") validators.push("uniqueIdentifier");
      if (field.type === "integer") validators.push("integer");
      if (field.type === "date") validators.push("iso8601Date");
      if (field.type === "uri") validators.push("url");

      // Name-based validators
      if (field.name.includes("latitude")) validators.push("latitude");
      if (field.name.includes("longitude")) validators.push("longitude");

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
 * 4. Writes final schema to external/dwcSchema.json
 */
export async function import_schema(): Promise<void> {
  // Parse all XML schemas
  const exMoFjson = xmlSchemaToJson(exMoFxml, {
    group: "ExtendedMeasurementOrFact",
    idFieldName: "measurementID",
  });
  const eventJson = xmlSchemaToJson(eventXml, { idFieldName: "eventID" });
  const occurrenceJson = xmlSchemaToJson(occurrenceXml, { idFieldName: "occurrenceID" });
  const taxonJson = xmlSchemaToJson(taxonXml, { idFieldName: "taxonID" });
  const DNAJson = xmlSchemaToJson(DNAXml, {
    group: "dnaDerivedData",
    idFieldName: "samp_name",
  });

  // Combine all schemas
  const schemaJson: SchemaJson = {
    ...exMoFjson,
    ...eventJson,
    ...occurrenceJson,
    ...taxonJson,
    ...DNAJson,
  };

  // Fetch and apply OBIS requirements
  const obisChecklist = await fetchObisChecklist();

  console.log("    Writing OBIS checklist to file");
  const obisChecklistPath = join(externalDir, "obisChecklist.json");
  await Deno.writeTextFile(
    obisChecklistPath,
    JSON.stringify(obisChecklist, null, 2),
  );

  // Apply OBIS requirements and assign validators
  joinObisRequirements(schemaJson, obisChecklist);
  assignValidators(schemaJson);

  // Write final schema
  const schemaPath = join(externalDir, "dwcSchema.json");
  await Deno.writeTextFile(schemaPath, JSON.stringify(schemaJson, null, 2));

  console.log(`Schema with OBIS checklist written to ${schemaPath}`);
}
