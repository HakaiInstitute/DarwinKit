// @ts-nocheck This is a non-critical path we can improve later
// deno-lint-ignore-file

// Convert Darwin Core xml schemas to json
//
// Run from the repo root:
//  deno run external/get_dc_schema.cjs
//
import csv from "csvtojson";
import fetch from "node-fetch";
import fs from "node:fs";
import type { tNode } from "txml";
import { parse, simplifyLostLess } from "txml";

// Read the XML file content
const exMoFxml =
  "../../external/rs_gbif/extension/obis/extended_measurement_or_fact_2023-08-28.xml";
const eventXml = "../../external/rs_gbif/core/dwc_event_2025-07-10.xml";
const occurrenceXml = "../../external/rs_gbif/core/dwc_occurrence_2025-07-10.xml";
const taxonXml = "../../external/rs_gbif/core/dwc_taxon_2025-07-10.xml";
const DNAXml = "../../external/rs_gbif/extension/gbif/1.0/dna_derived_data_2024-07-11.xml";

const obisChecklistUrl =
  "https://raw.githubusercontent.com/iobis/manual/master/docs/OBIS-termchecklist.csv";

// map thesaurus urls to local files, parse out their values, and return the new array to be
// added to the relevent schema field
const xmlThesaurusToJson = (inputID: string) => {
  const thesaurusPath = inputID.replace("http://rs.gbif.org/", "../../external/rs_gbif/").replace(
    "https://rs.gbif.org/",
    "../../external/rs_gbif/",
  );
  console.log(`    Getting vocabulary from ${thesaurusPath}`);
  const thesaurusXml = fs.readFileSync(thesaurusPath, "utf8");
  const xmlObject: (tNode | string)[] = parse(
    thesaurusXml.replaceAll("<voc:", "<").replaceAll("</voc:", "</"),
  );
  const simplifiedJson: Record<string, any> = simplifyLostLess(xmlObject as tNode[]);

  simplifiedJson.thesaurus[0].concept = simplifiedJson.thesaurus[0].concept.reduce(
    (acc: Record<string, any>, concept: Record<string, any>) => {
      const { _attributes, preferred, alternative } = concept;
      let AltRepresentations: string[] = [];
      // Each value has a perfered and alternative in multiple languages. The number of languages are not
      // consistent and may not contain an english version
      preferred?.forEach((alt: Record<string, any>) => {
        AltRepresentations = AltRepresentations.concat(
          alt.term?.filter((term: Record<string, any>) => term._attributes["xml:lang"] === "en"),
        );
      });
      alternative?.forEach((alt: Record<string, any>) => {
        AltRepresentations = AltRepresentations.concat(
          alt.term?.filter((term: Record<string, any>) => term._attributes["xml:lang"] === "en"),
        );
      });
      // some alternatives are empty lists  so when geting dc:title we need to filter out nulls
      AltRepresentations = AltRepresentations.map((term) =>
        (term as unknown as Record<string, any>)?._attributes["dc:title"]
      ).filter((x: string) => x);
      const { "dc:identifier": identifier, ...restAttrs } = _attributes;
      return { ...acc, [identifier]: { ...restAttrs, "names": AltRepresentations } };
    },
    {},
  );

  simplifiedJson.thesaurus = simplifiedJson.thesaurus.reduce(
    (acc: Record<string, any>, prop: Record<string, any>) => {
      const { _attributes, ...restProps } = prop;
      return { ...acc, ..._attributes, ...restProps };
    },
    {},
  );

  return simplifiedJson.thesaurus;
};

interface Options {
  group?: string;
  idFieldName: string;
}

// convert darwin core xml schemas into json
const xmlSchemaToJson = (filePath: string, options: Options) => {
  const { group, idFieldName } = options;
  console.log(`Reading Schema file ${filePath}`);

  const inputXML = fs.readFileSync(filePath, "utf8");

  // Parse the XML string
  const xmlObject: (tNode | string)[] = parse(inputXML);

  // Simplify the parsed object into a more straightforward JSON structure
  const simplifiedJson: Record<string, any> = simplifyLostLess(xmlObject as tNode[]);

  simplifiedJson.extension[0].property = simplifiedJson.extension[0].property.reduce(
    (acc: Record<string, any>, prop: Record<string, any>) => {
      const { name, thesaurus, required, "group": propGroup, ...rest } = prop._attributes;

      let label = name.split(/(?<![A-Z])(?=[A-Z])/).join(" ");
      label = label[0].toUpperCase() + label.slice(1);

      let collection: Record<string, any> = {
        ...acc,
        [name]: { "group": propGroup, name, label, ...rest, "gbif_required": required },
      };
      if (group) {
        collection[name].group = group;
      }
      if (thesaurus) {
        const thesaurusJson = xmlThesaurusToJson(thesaurus);
        collection[name] = { ...collection[name], thesaurus, "values": thesaurusJson.concept };
        if (!collection[name]?.type) {
          collection[name].type = "controlled-vocabulary";
        }
      }
      if (name == idFieldName) {
        collection[name].unique = "true";
        collection[name].type = "identifier";
      } else if (!collection[name]?.type && name.endsWith("ID")) {
        collection[name].type = "identifier";
      }
      return collection;
    },
    {},
  );

  simplifiedJson.extension = simplifiedJson.extension.reduce(
    (acc: Record<string, any>, prop: Record<string, any>) => {
      const { _attributes, property, ...restProps } = prop;
      const { name, ...rest } = _attributes;
      return {
        ...acc,
        [name]: { ...rest, name, "fieldOverrides": {}, "fields": property, ...restProps },
      };
    },
    {},
  );

  return simplifiedJson.extension;
};

// Convert several darwin core xml schemas into json and combine them into one file for later use.
// The obis checklist is used to set fields as required, recomended, or  optional
// validators are added by matching against field attributes or cmoponents of the field name
export async function import_schema() {
  const exMoFjson = xmlSchemaToJson(exMoFxml, {
    group: "ExtendedMeasurementOrFact",
    idFieldName: "measurementID",
  });
  const eventJson = xmlSchemaToJson(eventXml, { idFieldName: "eventID" });
  const occurrenceJson = xmlSchemaToJson(occurrenceXml, { idFieldName: "occurrenceID" });
  const taxonJson = xmlSchemaToJson(taxonXml, { idFieldName: "taxonID" });
  const DNAJson = xmlSchemaToJson(DNAXml, { group: "dnaDerivedData", idFieldName: "samp_name" });

  const schemaJson = { ...exMoFjson, ...eventJson, ...occurrenceJson, ...taxonJson, ...DNAJson };

  console.log("Fetching OBIS checklist...");
  const response = await fetch(obisChecklistUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${obisChecklistUrl}: ${response.statusText}`);
  }
  const csvText = await response.text();
  const obisChecklist = await csv().fromString(csvText.replace(/[^\x00-\x7F]/g, ""));

  console.log("    Writeing OBIS checklist to file");
  fs.writeFileSync("../../external/obisChecklist.json", JSON.stringify(obisChecklist, null, 2));

  console.log("    Joining OBIS checklist with schema");
  obisChecklist.forEach((item) => {
    const term = item.Term;
    Object.keys(schemaJson).forEach((key) => {
      const table = schemaJson[key];
      let affectedTable = [];
      if (item["Event Table"]) affectedTable.push("Event");
      if (item["Occurrence Extension"]) affectedTable.push("Occurrence");
      if (item["eMoF Table"]) affectedTable.push("ExtendedMeasurementOrFact");
      if (item["eMoF DNA Table"]) affectedTable.push("dnaDerivedData");
      if (table.fields[term]) {
        if (affectedTable.includes(key)) {
          table.fields[term] = { ...table.fields[term], "obis_required": item["OBIS Required"] };
        } else {
          table.fields[term] = { ...table.fields[term], "obis_required": "optional" };
        }
      }
    });
  });

  console.log("Assign Validators");
  Object.keys(schemaJson).forEach((key) => {
    const table = schemaJson[key];
    Object.keys(table.fields).forEach((fieldname) => {
      const field = table.fields[fieldname];
      const validators = [];
      if (field.obis_required == "required" || field.obis_required == "required (if exists)") {
        validators.push("required");
      }
      if (field.obis_required == "recommended" || field.obis_required == "strongly recommended") {
        validators.push("recommended");
      }
      if (field.unique == "true") validators.push("uniqueIdentifier");
      if (field.type == "integer") validators.push("integer");
      if (field.type == "date") validators.push("iso8601Date");
      if (field.type == "uri") validators.push("url");

      // Add range validators for geographic coordinates
      if (field.name.includes("Latitude") || field.name === "latitude") {
        validators.push({
          type: "range",
          enforcement: "required",
          params: { min: -90, max: 90 },
          message: "Latitude must be between -90 and +90 degrees",
        });
      }
      if (field.name.includes("Longitude") || field.name === "longitude") {
        validators.push({
          type: "range",
          enforcement: "required",
          params: { min: -180, max: 180 },
          message: "Longitude must be between -180 and +180 degrees",
        });
      }

      // Add range validators for temporal fields
      if (field.name === "month") {
        validators.push({
          type: "range",
          enforcement: "required",
          params: { min: 1, max: 12 },
          message: "Month must be between 1 and 12",
        });
      }
      if (field.name === "day") {
        validators.push({
          type: "range",
          enforcement: "required",
          params: { min: 1, max: 31 },
          message: "Day must be between 1 and 31",
        });
      }
      if (field.name === "year") {
        validators.push({
          type: "range",
          enforcement: "required",
          params: { min: 1600, max: new Date().getFullYear() },
          message: "Year must be between 1600 and current year",
        });
      }

      table.fields[fieldname] = { ...field, validators };
    });
  });

  fs.writeFileSync("../../external/dwcSchema.json", JSON.stringify(schemaJson, null, 2));
  console.log("Schema with OBIS checklist written to ./external/dwcSchema.json");
}
