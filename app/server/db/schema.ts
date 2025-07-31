import { relations } from "drizzle-orm";
import { z } from "zod";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import {
  integer,
  pgTable,
  timestamp,
  varchar,
  text,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

const idColumn = (name = "id") =>
  integer(name).primaryKey().generatedAlwaysAsIdentity();

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

export const userSchema = createSelectSchema(users);
export const createUserSchema = createInsertSchema(users);
export const updateUserSchema = createUpdateSchema(users);

export type User = z.infer<typeof userSchema>;
export type UserInsert = z.infer<typeof createUserSchema>;
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

export const sourceFileSchema = createSelectSchema(sourceFiles);
export const createFileSchema = createInsertSchema(sourceFiles);

export type SourceFile = z.infer<typeof sourceFileSchema>;
export type SourceFileInsert = z.infer<typeof createFileSchema>;

export const sourceFilesRelations = relations(sourceFiles, ({ one }) => ({
  project: one(projects, {
    fields: [sourceFiles.projectId],
    references: [projects.id],
  }),
}));

export const projectSchema = createSelectSchema(projects);
export const projectWithFilesSchema = projectSchema.extend({
  files: sourceFileSchema.array(),
});
export const createProjectSchema = createInsertSchema(projects);
export const updateProjectSchema = createUpdateSchema(projects);

export type Project = z.infer<typeof projectSchema>;
export type ProjectWithFiles = z.infer<typeof projectWithFilesSchema>;
export type ProjectInsert = z.infer<typeof createProjectSchema>;
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
    () => controlledVocabularies.id
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
  })
);

export const vocabularyTermsRelations = relations(
  vocabularyTerms,
  ({ one }) => ({
    vocabulary: one(controlledVocabularies, {
      fields: [vocabularyTerms.vocabularyId],
      references: [controlledVocabularies.id],
    }),
  })
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
  })
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
  })
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
  })
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
export const standardSchema = createSelectSchema(standards);
export const createStandardSchema = createInsertSchema(standards);
export type Standard = z.infer<typeof standardSchema>;
export type StandardInsert = z.infer<typeof createStandardSchema>;

export const standardFieldSchema = createSelectSchema(standardFields);
export const createStandardFieldSchema = createInsertSchema(standardFields);
export type StandardField = z.infer<typeof standardFieldSchema>;
export type StandardFieldInsert = z.infer<typeof createStandardFieldSchema>;

export const functionSchema = createSelectSchema(functions);
export const createFunctionSchema = createInsertSchema(functions);
export type Function = z.infer<typeof functionSchema>;
export type FunctionInsert = z.infer<typeof createFunctionSchema>;

export const functionParameterSchema = createSelectSchema(functionParameters);
export const createFunctionParameterSchema = createInsertSchema(functionParameters);
export type FunctionParameter = z.infer<typeof functionParameterSchema>;
export type FunctionParameterInsert = z.infer<typeof createFunctionParameterSchema>;

export const configurationSchema = createSelectSchema(configurations);
export const createConfigurationSchema = createInsertSchema(configurations);
export type Configuration = z.infer<typeof configurationSchema>;
export type ConfigurationInsert = z.infer<typeof createConfigurationSchema>;

export const fieldMappingSchema = createSelectSchema(fieldMappings);
export const createFieldMappingSchema = createInsertSchema(fieldMappings);
export type FieldMapping = z.infer<typeof fieldMappingSchema>;
export type FieldMappingInsert = z.infer<typeof createFieldMappingSchema>;

export const controlledVocabularySchema = createSelectSchema(
  controlledVocabularies
);
export const createControlledVocabularySchema = createInsertSchema(
  controlledVocabularies
);
export type ControlledVocabulary = z.infer<typeof controlledVocabularySchema>;
export type ControlledVocabularyInsert = z.infer<
  typeof createControlledVocabularySchema
>;

export const vocabularyTermSchema = createSelectSchema(vocabularyTerms);
export const createVocabularyTermSchema = createInsertSchema(vocabularyTerms);
export type VocabularyTerm = z.infer<typeof vocabularyTermSchema>;
export type VocabularyTermInsert = z.infer<typeof createVocabularyTermSchema>;
