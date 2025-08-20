/**
 * Validation Component Type Definitions for DarwinKit Configurator
 *
 * Types specific to the validation component of the pipeline,
 * which handles data validation operations.
 */

import type { BaseFieldConfiguration, BaseConfiguration, ValidationStep, FieldValidationConfig } from "./core.ts";

// Basic validation configuration for single fields
export interface ValidateConfiguration extends BaseFieldConfiguration {
  validations: ValidationStep[];
}

// Comprehensive validation configuration supporting both field-level and dataset-level validations
export interface ValidationConfiguration extends BaseConfiguration {
  fields: FieldValidationConfig[];
  datasetValidations?: ValidationStep[]; // Dataset-wide validations
}