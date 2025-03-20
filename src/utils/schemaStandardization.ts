
import { SchemaColumn } from '@/hooks/useNodeManagement';

/**
 * Standardize schema column type to consistent representation
 * Maps various type names to a common set of types
 */
export function standardizeColumnType(type: string): string {
  const lowerType = typeof type === 'string' ? type.toLowerCase() : 'unknown';
  
  // Map Excel/CSV types to standard types
  if (['number', 'numeric', 'integer', 'float', 'double', 'decimal', 'currency'].includes(lowerType)) {
    return 'number';
  }
  
  if (['text', 'varchar', 'char', 'character varying', 'character', 'string'].includes(lowerType)) {
    return 'string';
  }
  
  if (['date', 'datetime', 'timestamp', 'time', 'timestamp with time zone', 'timestamp without time zone'].includes(lowerType)) {
    return 'date';
  }
  
  if (['boolean', 'bool', 'bit'].includes(lowerType)) {
    return 'boolean';
  }
  
  if (['array', 'json', 'jsonb'].includes(lowerType)) {
    return 'array';
  }
  
  if (['object'].includes(lowerType)) {
    return 'object';
  }
  
  // Return the original type if no match is found
  return lowerType;
}

/**
 * Standardize an array of schema columns
 * Ensures consistent type naming across the application
 */
export function standardizeSchemaColumns(columns: SchemaColumn[]): SchemaColumn[] {
  if (!columns || !Array.isArray(columns)) {
    return [];
  }
  
  return columns.map(column => ({
    ...column,
    type: standardizeColumnType(column.type) as SchemaColumn['type']
  }));
}

/**
 * Check if a column type is numeric
 */
export function isNumericType(type: string): boolean {
  return standardizeColumnType(type) === 'number';
}

/**
 * Check if a column type is textual
 */
export function isTextType(type: string): boolean {
  return standardizeColumnType(type) === 'string';
}

/**
 * Check if a column type is date/time
 */
export function isDateType(type: string): boolean {
  return standardizeColumnType(type) === 'date';
}

/**
 * Check if a column type is boolean
 */
export function isBooleanType(type: string): boolean {
  return standardizeColumnType(type) === 'boolean';
}
