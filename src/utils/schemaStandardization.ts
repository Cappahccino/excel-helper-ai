
import { SchemaColumn } from '@/hooks/useNodeManagement';

/**
 * Standardizes schema column format for consistent type handling
 * Accepts various input formats and converts to a consistent SchemaColumn format
 */
export function standardizeSchemaColumn(column: any): SchemaColumn {
  // Start with a basic column structure
  const standardColumn: SchemaColumn = {
    name: '',
    type: 'unknown'
  };
  
  // Handle string value (just the column name)
  if (typeof column === 'string') {
    standardColumn.name = column;
    return standardColumn;
  }
  
  // Handle column objects with different structures
  if (typeof column === 'object' && column !== null) {
    // Set name from possible fields
    standardColumn.name = column.name || column.header || column.field || '';
    
    // Handle type with normalization
    const rawType = column.type || column.dataType || 'unknown';
    
    // Normalize type values
    if (typeof rawType === 'string') {
      const lowerType = rawType.toLowerCase();
      
      if (['string', 'text', 'varchar', 'char'].includes(lowerType)) {
        standardColumn.type = lowerType === 'text' ? 'text' : 'string';
      } else if (['int', 'integer', 'number', 'float', 'double', 'decimal', 'numeric'].includes(lowerType)) {
        standardColumn.type = 'number';
      } else if (['bool', 'boolean'].includes(lowerType)) {
        standardColumn.type = 'boolean';
      } else if (['date', 'datetime', 'timestamp'].includes(lowerType)) {
        standardColumn.type = 'date';
      } else if (lowerType === 'array') {
        standardColumn.type = 'array';
      } else if (lowerType === 'object') {
        standardColumn.type = 'object';
      } else {
        standardColumn.type = 'unknown';
      }
    }
  }
  
  return standardColumn;
}

/**
 * Standardize an array of schema columns from various formats
 */
export function standardizeSchemaColumns(columns: any[]): SchemaColumn[] {
  if (!Array.isArray(columns)) {
    console.warn('Expected columns to be an array, got:', typeof columns);
    return [];
  }
  
  return columns.map(standardizeSchemaColumn);
}

/**
 * Convert database-format schemas to standard SchemaColumn array
 */
export function convertDbSchemaToStandardSchema(dbSchema: any): SchemaColumn[] {
  if (!dbSchema) return [];
  
  if (dbSchema.columns && Array.isArray(dbSchema.columns)) {
    // Handle DB schema with separate columns and data_types objects
    if (dbSchema.data_types && typeof dbSchema.data_types === 'object') {
      return dbSchema.columns.map((colName: string) => ({
        name: colName,
        type: dbSchema.data_types[colName] || 'unknown'
      }));
    }
    
    // Handle DB schema with just column names
    return dbSchema.columns.map((colName: string) => ({
      name: typeof colName === 'string' ? colName : String(colName),
      type: 'unknown'
    }));
  }
  
  // If it's already an array of SchemaColumn-like objects
  if (Array.isArray(dbSchema)) {
    return standardizeSchemaColumns(dbSchema);
  }
  
  console.warn('Unrecognized schema format:', dbSchema);
  return [];
}

/**
 * Convert standard SchemaColumn array to database format
 */
export function convertStandardSchemaToDbFormat(schema: SchemaColumn[]): { 
  columns: string[],
  data_types: Record<string, string>
} {
  const columns = schema.map(col => col.name);
  const data_types = schema.reduce((acc, col) => {
    acc[col.name] = col.type;
    return acc;
  }, {} as Record<string, string>);
  
  return { columns, data_types };
}

/**
 * Validate if a schema is in the correct format
 */
export function isValidSchema(schema: any): boolean {
  if (!schema) return false;
  
  // Check if it's an array of schema columns
  if (Array.isArray(schema)) {
    return schema.every(col => 
      typeof col === 'object' && 
      col !== null && 
      typeof col.name === 'string' && 
      col.name.trim() !== ''
    );
  }
  
  // Check if it's a database schema format
  if (typeof schema === 'object' && 
      schema !== null && 
      Array.isArray(schema.columns) && 
      typeof schema.data_types === 'object') {
    return true;
  }
  
  return false;
}

/**
 * Check if two schemas are equivalent (same columns, possibly different order)
 */
export function areSchemasEquivalent(schema1: SchemaColumn[], schema2: SchemaColumn[]): boolean {
  if (!schema1 || !schema2) return false;
  if (schema1.length !== schema2.length) return false;
  
  // Create maps of column names to types for efficient comparison
  const schema1Map = new Map(schema1.map(col => [col.name, col.type]));
  const schema2Map = new Map(schema2.map(col => [col.name, col.type]));
  
  // Check if all columns in schema1 exist in schema2 with the same type
  for (const [name, type] of schema1Map.entries()) {
    if (!schema2Map.has(name) || schema2Map.get(name) !== type) {
      return false;
    }
  }
  
  return true;
}
