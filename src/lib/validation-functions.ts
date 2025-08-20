// import { z } from "zod/v4";
// import {
//   getCanonicalTerms,
//   findCanonicalTerm,
// } from "./vocabulary-service.ts";

// // Base validation result interface
// export interface ValidationResult {
//   isValid: boolean;
//   errors: string[];
//   warnings: string[];
// }

// // Base validation function interface
// export interface ValidationFunction<T = any> {
//   name: string;
//   description: string;
//   parameterSchema: z.ZodSchema<T>;
//   validate: (
//     value: any,
//     parameters: T
//   ) => ValidationResult | Promise<ValidationResult>;
// }

// // Helper to create successful validation result
// const success = (): ValidationResult => ({
//   isValid: true,
//   errors: [],
//   warnings: [],
// });

// // Helper to create failed validation result
// const failure = (
//   errors: string[],
//   warnings: string[] = []
// ): ValidationResult => ({
//   isValid: false,
//   errors,
//   warnings,
// });

// // Helper to create warning-only result
// const warning = (warnings: string[]): ValidationResult => ({
//   isValid: true,
//   errors: [],
//   warnings,
// });

// // Controlled vocabulary validation
// export const validateControlledVocabulary: ValidationFunction<
//   z.infer<typeof parameterSchemas.validateControlledVocabulary>
// > = {
//   name: "validateControlledVocabulary",
//   description: "Validates values against a controlled vocabulary",
//   parameterSchema: parameterSchemas.validateControlledVocabulary,
//   validate: async (value: string, params) => {
//     if (!value || typeof value !== "string") {
//       return failure(["Value is required and must be a string"]);
//     }

//     // Check if the value can be found in the vocabulary (including synonyms)
//     const canonicalTerm = await findCanonicalTerm(
//       params.vocabularyName,
//       value.trim(),
//       params.caseSensitive
//     );

//     const isValid = canonicalTerm !== null;

//     if (!isValid) {
//       const canonicalTerms = await getCanonicalTerms(params.vocabularyName);

//       if (params.strict) {
//         return failure([
//           `Value "${value}" is not in the controlled vocabulary "${params.vocabularyName}". ` +
//           `Allowed values: ${canonicalTerms.join(", ")}`,
//         ]);
//       } else {
//         return warning([
//           `Value "${value}" is not in the recommended vocabulary "${params.vocabularyName}". ` +
//           `Recommended values: ${canonicalTerms.join(", ")}`,
//         ]);
//       }
//     }

//     return success();
//   },
// };

// // Coordinate range validation
// export const validateCoordinateRange: ValidationFunction<
//   z.infer<typeof parameterSchemas.validateCoordinateRange>
// > = {
//   name: "validateCoordinateRange",
//   description: "Validates coordinate values are within valid ranges",
//   parameterSchema: parameterSchemas.validateCoordinateRange,
//   validate: (value: number | string, params) => {
//     if (value === null || value === undefined || value === "") {
//       return params.allowNull
//         ? success()
//         : failure(["Coordinate value is required"]);
//     }

//     const numValue = typeof value === "string" ? parseFloat(value) : value;

//     if (isNaN(numValue)) {
//       return failure(["Coordinate must be a valid number"]);
//     }

//     if (params.type === "latitude") {
//       if (numValue < -90 || numValue > 90) {
//         return failure(["Latitude must be between -90 and 90 degrees"]);
//       }
//     } else if (params.type === "longitude") {
//       if (numValue < -180 || numValue > 180) {
//         return failure(["Longitude must be between -180 and 180 degrees"]);
//       }
//     }

//     return success();
//   },
// };

// // Date range validation
// export const validateDateRange: ValidationFunction<
//   z.infer<typeof parameterSchemas.validateDateRange>
// > = {
//   name: "validateDateRange",
//   description: "Validates date values are within specified ranges",
//   parameterSchema: parameterSchemas.validateDateRange,
//   validate: (value: string | Date, params) => {
//     if (!value) {
//       return failure(["Date value is required"]);
//     }

//     let date: Date;

//     if (value instanceof Date) {
//       date = value;
//     } else if (typeof value === "string") {
//       date = new Date(value);
//     } else {
//       return failure(["Date must be a string or Date object"]);
//     }

//     if (isNaN(date.getTime())) {
//       return failure(["Invalid date format"]);
//     }

//     const now = new Date();

//     // Check future dates
//     if (!params.allowFuture && date > now) {
//       return failure(["Future dates are not allowed"]);
//     }

//     // Check minimum date
//     if (params.minDate) {
//       const minDate = new Date(params.minDate);
//       if (date < minDate) {
//         return failure([`Date must be after ${params.minDate}`]);
//       }
//     }

//     // Check maximum date
//     if (params.maxDate) {
//       const maxDate = new Date(params.maxDate);
//       if (date > maxDate) {
//         return failure([`Date must be before ${params.maxDate}`]);
//       }
//     }

//     return success();
//   },
// };

// // Required field validation
// export const validateRequired: ValidationFunction<
//   z.infer<typeof parameterSchemas.validateRequired>
// > = {
//   name: "validateRequired",
//   description: "Validates that a field has a value",
//   parameterSchema: parameterSchemas.validateRequired,
//   validate: (value: any, params) => {
//     if (value === null || value === undefined) {
//       return failure(["Field is required"]);
//     }

//     if (typeof value === "string") {
//       const trimmed = value.trim();
//       if (trimmed === "" && !params.allowEmpty) {
//         return failure(["Field cannot be empty"]);
//       }
//     }

//     return success();
//   },
// };

// // Validation function registry
// export const validationRegistry = {
//   validateControlledVocabulary,
//   validateCoordinateRange,
//   validateDateRange,
//   validateRequired,
// } as const;

// export type ValidationName = keyof typeof validationRegistry;

// // Function to execute validation with type safety
// export async function executeValidation(
//   functionName: ValidationName,
//   value: any,
//   parameters: any
// ): Promise<ValidationResult> {
//   const func = validationRegistry[functionName];

//   // Validate parameters against schema
//   const validatedParams = func.parameterSchema.parse(parameters);

//   return await func.validate(value, validatedParams);
// }

// // Execute multiple validations and combine results
// export async function executeValidations(
//   validations: Array<{ functionName: ValidationName; parameters: any }>,
//   value: any
// ): Promise<ValidationResult> {
//   const results = await Promise.all(
//     validations.map(({ functionName, parameters }) =>
//       executeValidation(functionName, value, parameters)
//     )
//   );

//   const allErrors = results.flatMap((r) => r.errors);
//   const allWarnings = results.flatMap((r) => r.warnings);
//   const isValid = results.every((r) => r.isValid);

//   return {
//     isValid,
//     errors: allErrors,
//     warnings: allWarnings,
//   };
// }
