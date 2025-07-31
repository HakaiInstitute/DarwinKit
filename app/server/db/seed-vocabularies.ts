import { db } from "./index";
import { 
  standards, 
  controlledVocabularies, 
  vocabularyTerms,
  standardFields,
  functions 
} from "./schema";

export async function seedVocabularies() {
  console.log("🌱 Seeding Darwin Core vocabularies...");

  // Create Darwin Core standard
  const [darwinCoreStandard] = await db
    .insert(standards)
    .values({
      name: "Darwin Core",
      version: "1.0.0",
      description: "Darwin Core standard for biodiversity data",
    })
    .returning();

  // Create controlled vocabularies
  const [sexVocabulary] = await db
    .insert(controlledVocabularies)
    .values({
      name: "darwin_core_sex",
      displayName: "Darwin Core Sex",
      description: "Controlled vocabulary for organism sex",
      strict: true, // Sex vocabulary is strict - only these 4 terms allowed
      standardId: darwinCoreStandard.id,
    })
    .returning();

  const [lifeStageVocabulary] = await db
    .insert(controlledVocabularies)
    .values({
      name: "darwin_core_life_stage",
      displayName: "Darwin Core Life Stage",
      description: "Controlled vocabulary for organism life stages",
      strict: false, // Life stage is recommended - allows custom terms with warnings
      standardId: darwinCoreStandard.id,
    })
    .returning();

  // Add sex vocabulary terms
  await db.insert(vocabularyTerms).values([
    {
      vocabularyId: sexVocabulary.id,
      term: "male",
      displayName: "Male",
      synonyms: ["M", "MALE", "Male", "m"],
      sortOrder: 1,
    },
    {
      vocabularyId: sexVocabulary.id,
      term: "female",
      displayName: "Female",
      synonyms: ["F", "FEMALE", "Female", "f"],
      sortOrder: 2,
    },
    {
      vocabularyId: sexVocabulary.id,
      term: "hermaphrodite",
      displayName: "Hermaphrodite",
      synonyms: ["H", "HERMAPHRODITE", "Hermaphrodite", "h"],
      sortOrder: 3,
    },
    {
      vocabularyId: sexVocabulary.id,
      term: "unknown",
      displayName: "Unknown",
      synonyms: ["U", "UNKNOWN", "Unknown", "u", "NA", "N/A"],
      sortOrder: 4,
    },
  ]);

  // Add life stage vocabulary terms
  await db.insert(vocabularyTerms).values([
    {
      vocabularyId: lifeStageVocabulary.id,
      term: "adult",
      displayName: "Adult",
      synonyms: ["ADULT", "Adult", "adult", "mature"],
      sortOrder: 1,
    },
    {
      vocabularyId: lifeStageVocabulary.id,
      term: "juvenile",
      displayName: "Juvenile",
      synonyms: ["JUVENILE", "Juvenile", "juv", "JUV", "young"],
      sortOrder: 2,
    },
    {
      vocabularyId: lifeStageVocabulary.id,
      term: "larva",
      displayName: "Larva",
      synonyms: ["LARVA", "Larva", "larvae", "larval"],
      sortOrder: 3,
    },
    {
      vocabularyId: lifeStageVocabulary.id,
      term: "egg",
      displayName: "Egg",
      synonyms: ["EGG", "Egg", "eggs", "embryo"],
      sortOrder: 4,
    },
    {
      vocabularyId: lifeStageVocabulary.id,
      term: "unknown",
      displayName: "Unknown",
      synonyms: ["UNKNOWN", "Unknown", "U", "NA", "N/A"],
      sortOrder: 5,
    },
  ]);

  // Create Darwin Core standard fields
  await db.insert(standardFields).values([
    {
      standardId: darwinCoreStandard.id,
      name: "sex",
      displayName: "Sex",
      description: "The sex of the biological individual(s) represented in the Occurrence",
      primitiveType: "string",
      semanticType: "controlled_vocabulary",
      controlledVocabularyId: sexVocabulary.id,
      // Uses vocabulary default (strict: true)
      required: false,
    },
    {
      standardId: darwinCoreStandard.id,
      name: "lifeStage",
      displayName: "Life Stage",
      description: "The age class or life stage of the biological individual(s) at the time the Occurrence was recorded",
      primitiveType: "string",
      semanticType: "controlled_vocabulary",
      controlledVocabularyId: lifeStageVocabulary.id,
      // Uses vocabulary default (strict: false)
      required: false,
    },
    {
      standardId: darwinCoreStandard.id,
      name: "reproductiveCondition",
      displayName: "Reproductive Condition",
      description: "The reproductive condition of the biological individual(s) at the time of the Occurrence",
      primitiveType: "string",
      semanticType: "controlled_vocabulary",
      controlledVocabularyId: lifeStageVocabulary.id,
      vocabularyStrictOverride: true, // Override: make life stage strict for reproductive condition
      required: false,
    },
    {
      standardId: darwinCoreStandard.id,
      name: "decimalLatitude",
      displayName: "Decimal Latitude",
      description: "The geographic latitude (in decimal degrees, using the spatial reference system given in geodeticDatum) of the geographic center of a Location",
      primitiveType: "float",
      semanticType: "coordinate",
      required: true,
    },
    {
      standardId: darwinCoreStandard.id,
      name: "decimalLongitude",
      displayName: "Decimal Longitude", 
      description: "The geographic longitude (in decimal degrees, using the spatial reference system given in geodeticDatum) of the geographic center of a Location",
      primitiveType: "float",
      semanticType: "coordinate",
      required: true,
    },
    {
      standardId: darwinCoreStandard.id,
      name: "eventDate",
      displayName: "Event Date",
      description: "The date-time or interval during which an Event occurred",
      primitiveType: "date",
      semanticType: "date",
      required: true,
    },
  ]);

  // Create transformation and validation functions
  await db.insert(functions).values([
    {
      name: "normalizeGender",
      type: "transformation",
      description: "Normalizes gender/sex values to Darwin Core controlled vocabulary",
      parameterSchema: {
        type: "object",
        properties: {
          maleTerms: { type: "array", items: { type: "string" } },
          femaleTerms: { type: "array", items: { type: "string" } },
          hermaphroditeTerms: { type: "array", items: { type: "string" } },
          defaultValue: { type: "string" }
        }
      },
    },
    {
      name: "normalizeControlledVocabulary",
      type: "transformation",
      description: "Normalizes values against a controlled vocabulary with fuzzy matching",
      parameterSchema: {
        type: "object",
        properties: {
          vocabularyName: { type: "string" },
          caseSensitive: { type: "boolean" },
          allowPartialMatch: { type: "boolean" },
          defaultValue: { type: "string" }
        },
        required: ["vocabularyName"]
      },
    },
    {
      name: "formatCoordinates",
      type: "transformation",
      description: "Formats coordinate values to specified precision and format",
      parameterSchema: {
        type: "object",
        properties: {
          precision: { type: "number", minimum: 1, maximum: 10 },
          format: { type: "string", enum: ["decimal", "dms"] }
        }
      },
    },
    {
      name: "formatDate",
      type: "transformation",
      description: "Formats date values to ISO 8601 or custom format",
      parameterSchema: {
        type: "object",
        properties: {
          inputFormat: { type: "string" },
          outputFormat: { type: "string" }
        }
      },
    },
    {
      name: "validateControlledVocabulary",
      type: "validation",
      description: "Validates values against a controlled vocabulary",
      parameterSchema: {
        type: "object",
        properties: {
          vocabularyName: { type: "string" },
          strict: { type: "boolean" },
          caseSensitive: { type: "boolean" }
        },
        required: ["vocabularyName"]
      },
    },
    {
      name: "validateCoordinateRange",
      type: "validation",
      description: "Validates coordinate values are within valid ranges",
      parameterSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["latitude", "longitude"] },
          allowNull: { type: "boolean" }
        },
        required: ["type"]
      },
    },
    {
      name: "validateDateRange",
      type: "validation",
      description: "Validates date values are within specified ranges",
      parameterSchema: {
        type: "object",
        properties: {
          minDate: { type: "string" },
          maxDate: { type: "string" },
          allowFuture: { type: "boolean" }
        }
      },
    },
    {
      name: "validateRequired",
      type: "validation",
      description: "Validates that a field has a value",
      parameterSchema: {
        type: "object",
        properties: {
          allowEmpty: { type: "boolean" }
        }
      },
    },
  ]);

  console.log("✅ Darwin Core vocabularies seeded successfully!");
}

// Run seeding if called directly
if (require.main === module) {
  seedVocabularies()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Error seeding vocabularies:", error);
      process.exit(1);
    });
}