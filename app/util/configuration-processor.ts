import { executeTransformation, TransformationName } from "./transformation-functions";
import { executeValidations, ValidationResult, ValidationName } from "./validation-functions";
import { FunctionCall, FieldMappingConfig, ProjectConfiguration } from "./configuration-types";

// Result of processing a single field
export interface FieldProcessingResult {
  sourceColumn: string;
  targetField: string;
  originalValue: any;
  transformedValue: any;
  validationResult: ValidationResult;
}

// Result of processing an entire row
export interface RowProcessingResult {
  rowIndex: number;
  fields: FieldProcessingResult[];
  isValid: boolean;
  hasWarnings: boolean;
}

// Result of processing entire dataset
export interface DataProcessingResult {
  rows: RowProcessingResult[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    rowsWithWarnings: number;
    fieldErrors: Record<string, number>;
    fieldWarnings: Record<string, number>;
  };
}

// Configuration processor class
export class ConfigurationProcessor {
  constructor(private config: ProjectConfiguration) {}

  // Process a single row of data
  async processRow(rowData: Record<string, any>, rowIndex: number): Promise<RowProcessingResult> {
    const fields: FieldProcessingResult[] = [];
    
    for (const mapping of this.config.fieldMappings) {
      const result = await this.processField(rowData, mapping);
      fields.push(result);
    }
    
    const isValid = fields.every(f => f.validationResult.isValid);
    const hasWarnings = fields.some(f => f.validationResult.warnings.length > 0);
    
    return {
      rowIndex,
      fields,
      isValid,
      hasWarnings,
    };
  }

  // Process a single field mapping
  private async processField(rowData: Record<string, any>, mapping: FieldMappingConfig): Promise<FieldProcessingResult> {
    const originalValue = rowData[mapping.sourceColumn];
    let transformedValue = originalValue;
    
    // Apply transformations in sequence
    for (const transformation of mapping.transformations) {
      try {
        transformedValue = await this.executeTransformationCall(transformedValue, transformation);
      } catch (error) {
        console.warn(`Transformation error for ${mapping.sourceColumn}:`, error);
        // Continue with untransformed value
        break;
      }
    }
    
    // Apply validations
    const validationCalls = mapping.validations.map(v => ({
      functionName: v.functionName as ValidationName,
      parameters: v.parameters,
    }));
    
    const validationResult = await executeValidations(validationCalls, transformedValue);
    
    return {
      sourceColumn: mapping.sourceColumn,
      targetField: mapping.targetField,
      originalValue,
      transformedValue,
      validationResult,
    };
  }

  // Execute a transformation function call
  private async executeTransformationCall(value: any, call: FunctionCall): Promise<any> {
    return await executeTransformation(
      call.functionName as TransformationName,
      value,
      call.parameters
    );
  }

  // Process entire dataset
  async processDataset(data: Record<string, any>[]): Promise<DataProcessingResult> {
    const rows = await Promise.all(
      data.map((row, index) => this.processRow(row, index))
    );
    
    // Calculate summary statistics
    const validRows = rows.filter(r => r.isValid).length;
    const invalidRows = rows.length - validRows;
    const rowsWithWarnings = rows.filter(r => r.hasWarnings).length;
    
    // Count field-level errors and warnings
    const fieldErrors: Record<string, number> = {};
    const fieldWarnings: Record<string, number> = {};
    
    for (const row of rows) {
      for (const field of row.fields) {
        if (field.validationResult.errors.length > 0) {
          fieldErrors[field.sourceColumn] = (fieldErrors[field.sourceColumn] || 0) + 1;
        }
        if (field.validationResult.warnings.length > 0) {
          fieldWarnings[field.sourceColumn] = (fieldWarnings[field.sourceColumn] || 0) + 1;
        }
      }
    }
    
    return {
      rows,
      summary: {
        totalRows: rows.length,
        validRows,
        invalidRows,
        rowsWithWarnings,
        fieldErrors,
        fieldWarnings,
      },
    };
  }

  // Get transformed data (only valid rows by default)
  async getTransformedData(
    data: Record<string, any>[],
    includeInvalidRows = false
  ): Promise<Record<string, any>[]> {
    const result = await this.processDataset(data);
    
    return result.rows
      .filter(row => includeInvalidRows || row.isValid)
      .map(row => {
        const transformedRow: Record<string, any> = {};
        
        for (const field of row.fields) {
          transformedRow[field.targetField] = field.transformedValue;
        }
        
        return transformedRow;
      });
  }
}