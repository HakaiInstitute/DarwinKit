/**
 * Transformation Component Type Definitions for DarwinKit Configurator
 *
 * Types specific to the transformation component of the pipeline,
 * which handles data transformation operations.
 */

import type { BaseFieldConfiguration, TransformationStep } from "./core.ts";

// Basic transformation configuration
export interface TransformConfiguration extends BaseFieldConfiguration {
  transformations: TransformationStep[];
}

// Note: TransformValidateFieldConfig moved to core.ts as it's cross-component