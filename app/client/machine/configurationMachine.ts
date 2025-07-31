import { assertEvent, assign, setup } from "xstate";

// WIP
// THIS IS NOT A COMPLETE MACHINE. The way it is currently described is not prescriptive of the final implementation.
//
// This machine will initially be able to handle the construction and modification of the declarative configuration this system uses.
// It will also be capable of executing the configuration's mapping, transformations, and validations on the data.
// To begin with it will only create the configuration, not execute it.
// Execution will be handled by actors within this parent system's context.

type ConfigurationMachineContext = {
  projectId: string;
  // Describes 1:1 mapping between source and target fields.
  // e.g. { "gender": "sex", "basis": "basisOfRecord" }
  mapping: Record<string, string>;
  // Describes transformations applied to source data fields before they're mapped to target fields.
  // e.g. Given the source field "gender" with the unique values "m" and "f", we can transform like so:
  // { "gender": {strategy: "controlledVocabulary", parameters: {"vocabulary": "dwc:sex", vocabularyMapping: {"m": "Male", "f": "Female"}}}
  transformations: Record<
    string,
    { strategy: string; parameters: Record<string, unknown> }
  >;
  // Validations are functions which are general or specific to a field.
  // They can be used to ensure data integrity, e.g. checking that a date matches a specific format or that a field's value is part of a controlled vocabulary.
  // e.g. { "date": [{ validation: "dateFormat", parameters: {format: "yy-mm-dd"} }] }
  // or { "basisOfRecord": [{ validation: "controlledVocabulary", parameters: { vocabulary: "basisOfRecord", strict: false }}]}
  // Validations can be applied to the entire dataset or to specific fields.
  validations: Record<
    string,
    { validation: string; parameters: Record<string, unknown> }
  >;
  derivedOutputs: Record<
    string,
    {
      source_field: string;
      target_field: string;
      derivation_strategy: string;
      parameters: Record<string, unknown>;
    }
  >;
  error: unknown | null;
};

type ConfigurationMachineInput = {
  projectId: string;
};

export type ConfigurationMachineEvent =
  | { type: "ADD_FIELD_MAPPING"; sourceField: string; targetField: string }
  | { type: "REMOVE_FIELD_MAPPING"; sourceField: string }
  | { type: "ADD_TRANSFORMATION"; field: string; transformation: string }
  | { type: "REMOVE_TRANSFORMATION"; field: string; transformation: string }
  | {
      type: "REFINE_VALIDATION";
      field: string;
      validation: string;
      parameters: Record<string, unknown>;
    }
  | {
      type: "ADD_DERIVED_OUTPUT";
      source_field: string;
      target_field: string;
      derivation_strategy: string;
      parameters: Record<string, unknown>;
    }
  | { type: "GENERATE_CONFIGURATION" }
  | { type: "MODIFY" }
  | { type: "RESET" };

export const configurationMachine = setup({
  types: {
    input: {} as ConfigurationMachineInput,
    context: {} as ConfigurationMachineContext,
    events: {} as ConfigurationMachineEvent,
  },
  actions: {
    addFieldMapping: ({ context, event }) => {
      assertEvent(event, "ADD_FIELD_MAPPING");
      return assign({
        mapping: () => ({
          ...context.mapping,
          [event.sourceField]: event.targetField,
        }),
      });
    },
    generateConfiguration: ({ context }) => {
      return JSON.stringify({
        projectId: context.projectId,
        mapping: context.mapping,
        derivedOutputs: context.derivedOutputs,
        transformations: context.transformations,
        validations: context.validations,
      });
    },
  },
  guards: {},
}).createMachine({
  context: ({ input }) => ({
    projectId: input.projectId,
    mapping: {},
    transformations: {},
    validations: {},
    derivedOutputs: {},
    error: null,
  }),
  id: "paperstream",
  initial: "ready",
  states: {
    ready: {
      on: {
        GENERATE_CONFIGURATION: {
          target: "output",
        },
      },
    },
    addingFieldMapping: {
      on: {
        ADD_FIELD_MAPPING: {
          target: "ready",
          actions: ["addFieldMapping"],
        },
      },
    },
    generatingConfiguration: {
      entry: ["generateConfiguration"],
      on: {
        MODIFY: "ready",
      },
    },
    error: {
      id: "error",
      type: "final",
    },
  },
});
