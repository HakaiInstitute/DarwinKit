/**
 * Unified Type System for DarwinKit Configurator
 *
 * Central export point for all configurator types to eliminate duplication
 * and provide a single source of truth for type definitions.
 */

// Core types
export type {
  SomePrimitive,
  StringableObject,
  VocabularyTerm,
  MockVocabulary,
  VocabularyData,
  GlobalParameters,
  DatasetValidationContext,
} from "./core";

// Result types
export type {
  BaseResult,
  ValidationResult,
  TransformationResult,
  ConfigurationValidationResult,
  StepExecutionResult,
  FieldExecutionResult,
  RowExecutionResult,
  DatasetExecutionResult,
  ValidationStepResult,
  FieldValidationResult,
  RowValidationResult,
  DatasetValidationResult,
} from "./results";

// Pipeline types
export type {
  TransformationStep,
  ValidationStep,
  TransformationFunction,
  ValidationFunction,
  RowValidationFunction,
  ComponentMode,
  ExecutionMode,
} from "./pipeline";

// Configuration types
export type {
  BaseConfiguration,
  BaseFieldConfiguration,
  IntegratedFieldConfiguration,
  IntegratedConfiguration,
  MappingConfiguration,
  TransformConfiguration,
  ValidateConfiguration,
  MappingOnlyFieldConfig,
  MappingTransformFieldConfig,
  MappingValidateFieldConfig,
  TransformValidateFieldConfig,
  FullPipelineFieldConfig,
  ModularFieldConfiguration,
  ModularConfiguration,
  FieldValidationConfig,
  ValidationConfiguration,
} from "./configuration";

// Performance optimizations
export type {
  OptimizedValidationResult,
  OptimizedTransformationResult,
  BrandedSuccess,
  BrandedFailure,
  ReadonlyValidationResult,
  ReadonlyTransformationResult,
  NonNullablePrimitive,
  ValidatableValue,
  DarwinCoreField,
  VocabularyName,
  ValidationCache,
  ValidationError,
  TransformationError,
  ConfigurationError,
  PipelineError,
  FieldMapping,
  FieldMappings,
  BatchProcessingOptions,
  BatchProcessor,
} from "./optimizations";

export {
  isValidationSuccess,
  isValidationFailure,
  isTransformationSuccess,
  isTransformationFailure,
  createSuccessResult,
  createFailureResult,
} from "./optimizations";

export {
  OptimizedVocabulary,
  VocabularyCache,
  vocabularyCache,
  ResultAccumulator,
  StringInterner,
  fieldNameInterner,
  isPrimitive,
  isNonEmptyString,
  isNumeric,
  processBatch,
  getProperty,
  setProperty,
  getMemoryStats,
  clearAllCaches,
} from "./performance";

export type { MemoryStats } from "./performance";

// Legacy type aliases for backward compatibility during migration
// These can be removed after all files are updated

/** @deprecated Use ValidationResult from types/results instead */
export type LegacyValidationResult = ValidationResult;

/** @deprecated Use TransformationResult from types/results instead */
export type LegacyTransformationResult = TransformationResult;

/** @deprecated Use ConfigurationValidationResult from types/results instead */
export type LegacyConfigurationValidationResult = ConfigurationValidationResult;
