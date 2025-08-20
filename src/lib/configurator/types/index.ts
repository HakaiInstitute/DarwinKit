/**
 * Unified Type System for DarwinKit Configurator
 *
 * Central export point for all configurator types to eliminate duplication
 * and provide a single source of truth for type definitions.
 */

import { ConfigurationValidationResult } from "../integrated-configuration.ts";
import { TransformationResult, ValidationResult } from "./results.ts";

// Core types (shared pipeline interfaces)
export type {
  // Core configuration types
  BaseConfiguration,
  BaseFieldConfiguration,
  ComponentMode,
  DataRow,
  DatasetValidationContext,
  DatasetValidationFunction,
  DataValue,
  ExecutionMode,
  // Simplified API types
  FieldOperation,
  FieldValidationConfig,
  FullPipelineFieldConfig,
  FunctionParameters as Parameters,
  GlobalParameters,
  // Cross-component orchestration
  IntegratedConfiguration,
  IntegratedFieldConfiguration,
  MappingOnlyFieldConfig,
  MappingTransformFieldConfig,
  MappingValidateFieldConfig,
  MockVocabulary,
  ModularConfiguration,
  ModularFieldConfiguration,
  PipelineConfiguration,
  RowValidationFunction,
  // Function signatures
  TransformationFunction,
  TransformationStep,
  TransformValidateFieldConfig,
  ValidationFunction,
  ValidationStep,
  VocabularyData,
  VocabularyTerm,
} from "./core.ts";

// Result types
export type {
  BaseResult,
  ConfigurationValidationResult,
  DatasetExecutionResult,
  DatasetValidationResult,
  // Simplified result types (moved from simplified.ts)
  ExecutionResult,
  FieldExecutionResult,
  FieldResult,
  FieldValidationResult,
  RowExecutionResult,
  RowResult,
  RowValidationResult,
  StepExecutionResult,
  TransformationResult,
  ValidationResult,
  ValidationStepResult,
} from "./results.ts";

// Mapping component types
export type { MappingConfiguration } from "./mapping.ts";

// Transformation component types
export type { TransformConfiguration } from "./transformation.ts";

// Validation component types
export type { ValidateConfiguration, ValidationConfiguration } from "./validation.ts";

// Performance optimizations
export type {
  BatchProcessingOptions,
  BatchProcessor,
  BrandedFailure,
  BrandedSuccess,
  ConfigurationError,
  DarwinCoreField,
  FieldMapping,
  FieldMappings,
  NonNullablePrimitive,
  OptimizedTransformationResult,
  OptimizedValidationResult,
  PipelineError,
  ReadonlyTransformationResult,
  ReadonlyValidationResult,
  TransformationError,
  ValidatableValue,
  ValidationCache,
  ValidationError,
  VocabularyName,
} from "./optimizations.ts";

export {
  createFailureResult,
  createSuccessResult,
  isTransformationFailure,
  isTransformationSuccess,
  isValidationFailure,
  isValidationSuccess,
} from "./optimizations.ts";

// Note: performance.ts not found - these exports have been removed

// Legacy type aliases for backward compatibility during migration
// These can be removed after all files are updated

/** @deprecated Use ValidationResult from types/results instead */
export type LegacyValidationResult = ValidationResult;

/** @deprecated Use TransformationResult from types/results instead */
export type LegacyTransformationResult = TransformationResult;

/** @deprecated Use ConfigurationValidationResult from types/results instead */
export type LegacyConfigurationValidationResult = ConfigurationValidationResult;
