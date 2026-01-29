/**
 * Controlled vocabulary registry for Darwin Core and other specifications
 *
 * Vocabularies are defined as const objects to ensure TypeScript
 * type safety and autocompletion for vocabulary values.
 */

import * as Effect from "effect/Effect";

/**
 * Darwin Core controlled vocabularies
 *
 * These vocabularies follow Darwin Core recommendations and include
 * commonly used terms. Values are based on official Darwin Core
 * documentation and community best practices.
 */
export const VOCABULARIES = {
  // Basis of Record - Nature of the data record
  basisOfRecord: [
    "PreservedSpecimen", // Physical specimen preserved in collection
    "FossilSpecimen", // Fossilized specimen
    "LivingSpecimen", // Living specimen in collection
    "MaterialSample", // Physical sample (tissue, DNA, etc.)
    "Event", // Sampling event without specimens
    "HumanObservation", // Observation by human
    "MachineObservation", // Observation by machine/sensor
    "Taxon", // Taxonomic concept
    "Occurrence", // General occurrence record
  ],

  // Taxonomic Rank - Rank in taxonomic hierarchy
  taxonRank: [
    "kingdom",
    "subkingdom",
    "infrakingdom",
    "phylum",
    "subphylum",
    "infraphylum",
    "class",
    "subclass",
    "infraclass",
    "cohort",
    "subcohort",
    "infracohort",
    "superorder",
    "order",
    "suborder",
    "infraorder",
    "parvorder",
    "superfamily",
    "family",
    "subfamily",
    "tribe",
    "subtribe",
    "genus",
    "subgenus",
    "section",
    "subsection",
    "series",
    "subseries",
    "species",
    "subspecies",
    "variety",
    "subvariety",
    "form",
    "subform",
    "cultivar",
    "strain",
    "isolate",
  ],

  // Occurrence Status - Whether taxon was present or absent
  occurrenceStatus: [
    "present", // Taxon was observed/collected
    "absent", // Taxon was looked for but not found
  ],

  // Life Stage - Age class or life stage of organism
  lifeStage: [
    "zygote",
    "embryo",
    "larva",
    "juvenile",
    "adult",
    "sporophyte",
    "gametophyte",
    "spore",
    "seed",
    "egg",
    "eft",
    "nymph",
    "subimago",
    "imago",
    "pupa",
    "instar",
    "tadpole",
    "fledgling",
    "hatchling",
    "nestling",
    "fry",
    "parr",
    "smolt",
  ],

  // Sex - Sex of the organism
  sex: [
    "female",
    "male",
    "hermaphrodite",
    "undetermined",
  ],

  // Establishment Means - How organism came to be in location
  establishmentMeans: [
    "native", // Naturally occurring in region
    "nativeReintroduced", // Native species reintroduced
    "introduced", // Non-native, introduced by humans
    "naturalised", // Non-native but reproducing naturally
    "invasive", // Non-native causing ecological/economic harm
    "managed", // Maintained by direct human intervention
    "uncertain", // Establishment means unknown
  ],

  // Pathway - How organism was introduced (if non-native)
  pathway: [
    "releasedForUse",
    "escapeFromConfinement",
    "transportContaminant",
    "transportStowaway",
    "corridor",
    "unaided",
    "other",
    "unknown",
  ],

  // Degree of Establishment - How well established organism is
  degreeOfEstablishment: [
    "native",
    "captive",
    "cultivated",
    "released",
    "failing",
    "casual",
    "reproducing",
    "established",
    "colonising",
    "invasive",
    "widespread",
  ],

  // Country Code - ISO 3166-1 alpha-2 country codes (subset)
  countryCode: [
    "AD",
    "AE",
    "AF",
    "AG",
    "AI",
    "AL",
    "AM",
    "AO",
    "AQ",
    "AR",
    "AS",
    "AT",
    "AU",
    "AW",
    "AX",
    "AZ",
    "BA",
    "BB",
    "BD",
    "BE",
    "BF",
    "BG",
    "BH",
    "BI",
    "BJ",
    "BL",
    "BM",
    "BN",
    "BO",
    "BQ",
    "BR",
    "BS",
    "BT",
    "BV",
    "BW",
    "BY",
    "BZ",
    "CA",
    "CC",
    "CD",
    "CF",
    "CG",
    "CH",
    "CI",
    "CK",
    "CL",
    "CM",
    "CN",
    "CO",
    "CR",
    "CU",
    "CV",
    "CW",
    "CX",
    "CY",
    "CZ",
    "DE",
    "DJ",
    "DK",
    "DM",
    "DO",
    "DZ",
    "EC",
    "EE",
    "EG",
    "EH",
    "ER",
    "ES",
    "ET",
    "FI",
    "FJ",
    "FK",
    "FM",
    "FO",
    "FR",
    "GA",
    "GB",
    "GD",
    "GE",
    "GF",
    "GG",
    "GH",
    "GI",
    "GL",
    "GM",
    "GN",
    "GP",
    "GQ",
    "GR",
    "GS",
    "GT",
    "GU",
    "GW",
    "GY",
    "HK",
    "HM",
    "HN",
    "HR",
    "HT",
    "HU",
    "ID",
    "IE",
    "IL",
    "IM",
    "IN",
    "IO",
    "IQ",
    "IR",
    "IS",
    "IT",
    "JE",
    "JM",
    "JO",
    "JP",
    "KE",
    "KG",
    "KH",
    "KI",
    "KM",
    "KN",
    "KP",
    "KR",
    "KW",
    "KY",
    "KZ",
    "LA",
    "LB",
    "LC",
    "LI",
    "LK",
    "LR",
    "LS",
    "LT",
    "LU",
    "LV",
    "LY",
    "MA",
    "MC",
    "MD",
    "ME",
    "MF",
    "MG",
    "MH",
    "MK",
    "ML",
    "MM",
    "MN",
    "MO",
    "MP",
    "MQ",
    "MR",
    "MS",
    "MT",
    "MU",
    "MV",
    "MW",
    "MX",
    "MY",
    "MZ",
    "NA",
    "NC",
    "NE",
    "NF",
    "NG",
    "NI",
    "NL",
    "NO",
    "NP",
    "NR",
    "NU",
    "NZ",
    "OM",
    "PA",
    "PE",
    "PF",
    "PG",
    "PH",
    "PK",
    "PL",
    "PM",
    "PN",
    "PR",
    "PS",
    "PT",
    "PW",
    "PY",
    "QA",
    "RE",
    "RO",
    "RS",
    "RU",
    "RW",
    "SA",
    "SB",
    "SC",
    "SD",
    "SE",
    "SG",
    "SH",
    "SI",
    "SJ",
    "SK",
    "SL",
    "SM",
    "SN",
    "SO",
    "SR",
    "SS",
    "ST",
    "SV",
    "SX",
    "SY",
    "SZ",
    "TC",
    "TD",
    "TF",
    "TG",
    "TH",
    "TJ",
    "TK",
    "TL",
    "TM",
    "TN",
    "TO",
    "TR",
    "TT",
    "TV",
    "TW",
    "TZ",
    "UA",
    "UG",
    "UM",
    "US",
    "UY",
    "UZ",
    "VA",
    "VC",
    "VE",
    "VG",
    "VI",
    "VN",
    "VU",
    "WF",
    "WS",
    "YE",
    "YT",
    "ZA",
    "ZM",
    "ZW",
  ],

  // Type Status - Nomenclatural status of specimen
  typeStatus: [
    "type",
    "holotype",
    "lectotype",
    "neotype",
    "syntype",
    "paratype",
    "allotype",
    "isotype",
    "epitype",
    "plastotype",
    "topotype",
    "extype",
  ],

  // Preparation Type - How specimen was prepared/preserved
  preparationType: [
    "fossil",
    "cast",
    "photograph",
    "DNA sample",
    "skeleton",
    "skull",
    "whole animal (ETOH)",
    "whole animal (dried)",
    "whole animal (frozen)",
    "whole animal (fluid)",
    "tissue (ETOH)",
    "tissue (frozen)",
    "tissue (dried)",
    "pinned",
    "mounted",
    "slide mount",
    "impression",
    "trace",
  ],

  // Reproductive Condition - Reproductive state of organism
  reproductiveCondition: [
    "non-reproductive",
    "pre-reproductive",
    "reproductive",
    "post-reproductive",
    "fertile",
    "sterile",
    "gravid",
    "pregnant",
    "brooding",
    "flowering",
    "fruiting",
    "budding",
  ],

  // Behavior - Observed behavior of organism
  behavior: [
    "foraging",
    "feeding",
    "nesting",
    "roosting",
    "mating",
    "territorial",
    "migratory",
    "resting",
    "traveling",
    "vocalizing",
    "aggressive",
    "defensive",
  ],
} as const;

/**
 * Type helpers for vocabulary keys and values
 */
export type VocabularyKey = keyof typeof VOCABULARIES;
export type VocabularyValues<K extends VocabularyKey> = typeof VOCABULARIES[K][number];
export type VocabularyArray<K extends VocabularyKey> = (typeof VOCABULARIES)[K];

/**
 * Get values for a specific vocabulary
 */
export function getVocabularyValues<K extends VocabularyKey>(
  key: K,
): Effect.Effect<VocabularyArray<K>, Error>;
export function getVocabularyValues(
  key: string,
): Effect.Effect<unknown, Error>;
export function getVocabularyValues(key: string) {
  if (isVocabularyKey(key)) {
    const value = VOCABULARIES[key];
    return Effect.succeed(value);
  }

  return Effect.fail(new Error(`Vocabulary key "${key}" not found`));
}

function isVocabularyKey(key: string): key is VocabularyKey {
  return key in VOCABULARIES;
}

/**
 * Check if a value is valid for a given vocabulary
 */
export function isValidVocabularyValue<K extends VocabularyKey>(
  vocabularyKey: K,
  value: string,
): value is VocabularyValues<K> {
  const vocabulary = VOCABULARIES[vocabularyKey];
  return (vocabulary as readonly string[]).includes(value);
}
