import { DataRow, Dataset } from "../configurator/types/core.ts";

type ValidationContext = {
  index: number;
  row: DataRow;
  fields: Record<string, { vocabulary?: string[] }>;
};

type Validator<T> = (context: ValidationContext, field: string, input: T) => boolean;

export const validateControlledVocabulary: Validator<string> = (context, field, input) => {
  const vocabulary = context.fields[field].vocabulary || [];

  return vocabulary.includes(input);
};

export const validateDecimalLatitude: Validator<number> = (_context, _field, input) => {
  return input >= -90 && input <= 90;
};

export const validateDecimalLongitude: Validator<number> = (_context, _field, input) => {
  return input >= -180 && input <= 180;
};

export const validateGeodeticDatum: Validator<string> = (_context, _field, input) => {
  const validDatums = ["WGS84", "EPSG:4326"];
  return validDatums.includes(input);
};

export const validateEventID: Validator<string> = (_context, _field, input) => {
  return /^[A-Za-z0-9\-_]+$/.test(input);
};

export const validateMinimumDepthInMeters: Validator<number> = (context, _field, input) => {
  const minDepth = input;
  const maxDepth = context.row.maximumDepthInMeters;

  if (
    maxDepth !== undefined && minDepth !== undefined && typeof maxDepth === "number" &&
    typeof minDepth === "number"
  ) {
    return input >= minDepth && input <= maxDepth;
  }

  return false;
};

export const validateDate: Validator<Date> = (_context, _field, input) => {
  return !isNaN(input.getTime());
};
