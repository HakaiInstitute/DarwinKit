import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import * as z from "zod/v4";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "npm:drizzle-zod";

const idColumn = (name = "id") => integer(name).primaryKey().generatedAlwaysAsIdentity();

const timestamps = {
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
};

const MAXIMUM_EMAIL_LENGTH = 320;

export const users = pgTable("user", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar({ length: MAXIMUM_EMAIL_LENGTH }).notNull().unique(),
  password: varchar({ length: 255 }).notNull(),
});

export const userSelectSchema = createSelectSchema(users);
export const userInsertSchema = createInsertSchema(users);
export const updateUserSchema = createUpdateSchema(users);

export type User = z.infer<typeof userSelectSchema>;
export type UserInsert = z.infer<typeof userInsertSchema>;
export type UserUpdate = z.infer<typeof updateUserSchema>;

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export const projects = pgTable("project", {
  id: idColumn(),
  title: varchar("title").notNull(),
  description: varchar("description", { length: 500 }).default("").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const sourceFiles = pgTable("source_file", {
  id: idColumn(),
  name: varchar("name").notNull(),
  path: varchar("path").notNull(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  ...timestamps,
});

export const sourceFilesRelations = relations(sourceFiles, ({ one }) => ({
  project: one(projects, {
    fields: [sourceFiles.projectId],
    references: [projects.id],
  }),
}));

export const selectSourceFileSchema = createSelectSchema(sourceFiles);
export const createSourceFileSchema = createInsertSchema(sourceFiles);
export const updateSourceFileSchema = createUpdateSchema(sourceFiles);

export type SourceFile = z.infer<typeof selectSourceFileSchema>;
export type SourceFileInsert = z.infer<typeof createSourceFileSchema>;
export type SourceFileUpdate = z.infer<typeof updateSourceFileSchema>;

export const selectProjectSchema = createSelectSchema(projects);
export const projectWithFilesSchema = selectProjectSchema.extend({
  files: selectSourceFileSchema.array(),
});
export const insertProjectSchema = createInsertSchema(projects);
export const updateProjectSchema = createUpdateSchema(projects);

export type Project = z.infer<typeof selectProjectSchema>;
export type ProjectWithFiles = z.infer<typeof projectWithFilesSchema>;
export type ProjectInsert = z.infer<typeof insertProjectSchema>;
export type ProjectUpdate = z.infer<typeof updateProjectSchema>;

export const projectRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  files: many(sourceFiles),
  configurations: many(configurations),
}));

// Standards (e.g., Darwin Core) with versioning
export const standards = pgTable("standard", {
  id: idColumn(),
  name: varchar("name").notNull(), // e.g., "Darwin Core"
  version: varchar("version").notNull(), // e.g., "1.0.0"
  description: text("description"),
  ...timestamps,
});

// Controlled vocabularies that can be shared across fields
export const controlledVocabularies = pgTable("controlled_vocabulary", {
  id: idColumn(),
  name: varchar("name").notNull().unique(), // e.g., "darwin_core_sex"
  displayName: varchar("display_name").notNull(), // e.g., "Darwin Core Sex"
  description: text("description"),
  version: varchar("version").notNull().default("1.0.0"),
  strict: boolean("strict").default(true).notNull(), // Default strictness level
  standardId: integer("standard_id").references(() => standards.id, {
    onDelete: "cascade",
  }),
  ...timestamps,
});

// Individual terms within a controlled vocabulary
export const vocabularyTerms = pgTable("vocabulary_term", {
  id: idColumn(),
  vocabularyId: integer("vocabulary_id")
    .references(() => controlledVocabularies.id, { onDelete: "cascade" })
    .notNull(),
  term: varchar("term").notNull(), // e.g., "male"
  displayName: varchar("display_name"), // e.g., "Male"
  description: text("description"),
  synonyms: jsonb("synonyms").default([]).notNull(), // ["M", "MALE", "Male"]
  deprecated: boolean("deprecated").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  ...timestamps,
});

// Standard fields with semantic types
export const standardFields = pgTable("standard_field", {
  id: idColumn(),
  standardId: integer("standard_id")
    .references(() => standards.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name").notNull(), // e.g., "sex"
  displayName: varchar("display_name").notNull(), // e.g., "Sex"
  description: text("description"),
  primitiveType: varchar("primitive_type").notNull(), // "string", "integer", "boolean", "date"
  semanticType: varchar("semantic_type").notNull(), // "controlled_vocabulary", "coordinate", "measurement", etc.
  required: boolean("required").default(false).notNull(),
  // Reference to controlled vocabulary (if applicable)
  controlledVocabularyId: integer("controlled_vocabulary_id").references(
    () => controlledVocabularies.id,
  ),
  // Optional override of vocabulary's default strictness (null = use vocabulary default)
  vocabularyStrictOverride: boolean("vocabulary_strict_override"),
  ...timestamps,
});

// Function definitions for transformations and validations
export const functions = pgTable("function", {
  id: idColumn(),
  name: varchar("name").notNull().unique(), // e.g., "normalizeGender", "validateCoordinate"
  type: varchar("type").notNull(), // "transformation" or "validation"
  description: text("description"),
  ...timestamps,
});

// Function parameters with type safety and validation
export const functionParameters = pgTable("function_parameter", {
  id: idColumn(),
  functionId: integer("function_id")
    .references(() => functions.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name").notNull(), // e.g., "minLength", "format", "precision"
  type: varchar("type").notNull(), // "string", "number", "boolean", "array", "object"
  required: boolean("required").default(false).notNull(),
  defaultValue: jsonb("default_value"), // Actual default value as JSON
  description: text("description"),
  validationRules: jsonb("validation_rules"), // min/max values, enum options, regex patterns
  sortOrder: integer("sort_order").default(0).notNull(),
  ...timestamps,
});

// Project configurations for mapping/transforming/validating
export const configurations = pgTable("configuration", {
  id: idColumn(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  sourceFileId: integer("source_file_id")
    .references(() => sourceFiles.id, { onDelete: "cascade" })
    .notNull(),
  standardId: integer("standard_id")
    .references(() => standards.id)
    .notNull(),
  name: varchar("name").notNull(), // user-defined name for this configuration
  ...timestamps,
});

// Field mappings within a configuration
export const fieldMappings = pgTable("field_mapping", {
  id: idColumn(),
  configurationId: integer("configuration_id")
    .references(() => configurations.id, { onDelete: "cascade" })
    .notNull(),
  sourceColumnName: varchar("source_column_name").notNull(),
  targetFieldId: integer("target_field_id")
    .references(() => standardFields.id)
    .notNull(),
  // JSON array of transformation function calls
  transformations: jsonb("transformations").default([]).notNull(),
  // JSON array of validation function calls
  validations: jsonb("validations").default([]).notNull(),
  ...timestamps,
});

// Relations
export const standardsRelations = relations(standards, ({ many }) => ({
  fields: many(standardFields),
  configurations: many(configurations),
  vocabularies: many(controlledVocabularies),
}));

export const controlledVocabulariesRelations = relations(
  controlledVocabularies,
  ({ one, many }) => ({
    standard: one(standards, {
      fields: [controlledVocabularies.standardId],
      references: [standards.id],
    }),
    terms: many(vocabularyTerms),
    fields: many(standardFields),
  }),
);

export const vocabularyTermsRelations = relations(
  vocabularyTerms,
  ({ one }) => ({
    vocabulary: one(controlledVocabularies, {
      fields: [vocabularyTerms.vocabularyId],
      references: [controlledVocabularies.id],
    }),
  }),
);

export const standardFieldsRelations = relations(
  standardFields,
  ({ one, many }) => ({
    standard: one(standards, {
      fields: [standardFields.standardId],
      references: [standards.id],
    }),
    controlledVocabulary: one(controlledVocabularies, {
      fields: [standardFields.controlledVocabularyId],
      references: [controlledVocabularies.id],
    }),
    mappings: many(fieldMappings),
  }),
);

export const functionsRelations = relations(functions, ({ many }) => ({
  parameters: many(functionParameters),
}));

export const functionParametersRelations = relations(
  functionParameters,
  ({ one }) => ({
    function: one(functions, {
      fields: [functionParameters.functionId],
      references: [functions.id],
    }),
  }),
);

export const configurationsRelations = relations(
  configurations,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [configurations.projectId],
      references: [projects.id],
    }),
    sourceFile: one(sourceFiles, {
      fields: [configurations.sourceFileId],
      references: [sourceFiles.id],
    }),
    standard: one(standards, {
      fields: [configurations.standardId],
      references: [standards.id],
    }),
    fieldMappings: many(fieldMappings),
  }),
);

export const fieldMappingsRelations = relations(fieldMappings, ({ one }) => ({
  configuration: one(configurations, {
    fields: [fieldMappings.configurationId],
    references: [configurations.id],
  }),
  targetField: one(standardFields, {
    fields: [fieldMappings.targetFieldId],
    references: [standardFields.id],
  }),
}));

// Schemas and types
export const standardSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  version: z.string(),
  description: z.string().nullable(),
  updatedAt: z.date(),
  createdAt: z.date(),
});
export const createStandardSchema = standardSchema.omit({
  id: true,
  updatedAt: true,
  createdAt: true,
});
export type Standard = z.infer<typeof standardSchema>;
export type StandardInsert = z.infer<typeof createStandardSchema>;

export const standardFieldSchema = z.object({
  id: z.number().int(),
  standardId: z.number().int(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  primitiveType: z.string(),
  semanticType: z.string(),
  required: z.boolean(),
  controlledVocabularyId: z.number().int().nullable(),
  vocabularyStrictOverride: z.boolean().nullable(),
  updatedAt: z.date(),
  createdAt: z.date(),
});
export const createStandardFieldSchema = standardFieldSchema.omit({
  id: true,
  updatedAt: true,
  createdAt: true,
});
export type StandardField = z.infer<typeof standardFieldSchema>;
export type StandardFieldInsert = z.infer<typeof createStandardFieldSchema>;

export const functionSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  updatedAt: z.date(),
  createdAt: z.date(),
});
export const createFunctionSchema = functionSchema.omit({
  id: true,
  updatedAt: true,
  createdAt: true,
});
export type Function = z.infer<typeof functionSchema>;
export type FunctionInsert = z.infer<typeof createFunctionSchema>;

export const functionParameterSchema = z.object({
  id: z.number().int(),
  functionId: z.number().int(),
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  defaultValue: z.any().nullable(),
  description: z.string().nullable(),
  validationRules: z.any().nullable(),
  sortOrder: z.number().int(),
  updatedAt: z.date(),
  createdAt: z.date(),
});
export const createFunctionParameterSchema = functionParameterSchema.omit({
  id: true,
  updatedAt: true,
  createdAt: true,
});
export type FunctionParameter = z.infer<typeof functionParameterSchema>;
export type FunctionParameterInsert = z.infer<typeof createFunctionParameterSchema>;

export const configurationSchema = z.object({
  id: z.number().int(),
  projectId: z.number().int(),
  sourceFileId: z.number().int(),
  standardId: z.number().int(),
  name: z.string(),
  updatedAt: z.date(),
  createdAt: z.date(),
});
export const createConfigurationSchema = configurationSchema.omit({
  id: true,
  updatedAt: true,
  createdAt: true,
});
export type Configuration = z.infer<typeof configurationSchema>;
export type ConfigurationInsert = z.infer<typeof createConfigurationSchema>;

export const fieldMappingSchema = z.object({
  id: z.number().int(),
  configurationId: z.number().int(),
  sourceColumnName: z.string(),
  targetFieldId: z.number().int(),
  transformations: z.any(),
  validations: z.any(),
  updatedAt: z.date(),
  createdAt: z.date(),
});
export const createFieldMappingSchema = fieldMappingSchema.omit({
  id: true,
  updatedAt: true,
  createdAt: true,
});
export type FieldMapping = z.infer<typeof fieldMappingSchema>;
export type FieldMappingInsert = z.infer<typeof createFieldMappingSchema>;

export const controlledVocabularySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  version: z.string(),
  strict: z.boolean(),
  standardId: z.number().int().nullable(),
  updatedAt: z.date(),
  createdAt: z.date(),
});
export const createControlledVocabularySchema = controlledVocabularySchema.omit({
  id: true,
  updatedAt: true,
  createdAt: true,
});
export type ControlledVocabulary = z.infer<typeof controlledVocabularySchema>;
export type ControlledVocabularyInsert = z.infer<typeof createControlledVocabularySchema>;

export const vocabularyTermSchema = z.object({
  id: z.number().int(),
  vocabularyId: z.number().int(),
  term: z.string(),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  synonyms: z.any(),
  deprecated: z.boolean(),
  sortOrder: z.number().int(),
  updatedAt: z.date(),
  createdAt: z.date(),
});
export const createVocabularyTermSchema = vocabularyTermSchema.omit({
  id: true,
  updatedAt: true,
  createdAt: true,
});
export type VocabularyTerm = z.infer<typeof vocabularyTermSchema>;
export type VocabularyTermInsert = z.infer<typeof createVocabularyTermSchema>;
