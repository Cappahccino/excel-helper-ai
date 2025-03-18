
import { SchemaColumn } from '@/hooks/useNodeManagement';

/**
 * Standardize column names by removing invalid characters and spaces
 */
export function standardizeColumnName(name: string): string {
  if (!name) return '';
  
  // Replace spaces with underscores
  let standardName = name.trim().replace(/\s+/g, '_');
  
  // Remove invalid characters
  standardName = standardName.replace(/[^a-zA-Z0-9_]/g, '');
  
  // Ensure it starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(standardName)) {
    standardName = 'col_' + standardName;
  }
  
  return standardName;
}

/**
 * Standardize column type to one of the supported types
 */
export function standardizeColumnType(type: string): "string" | "number" | "boolean" | "object" | "date" | "unknown" | "array" | "text" {
  if (!type) return 'string';
  
  const lowerType = type.toLowerCase();
  
  // Map to standard types
  if (['varchar', 'char', 'text', 'string', 'str'].includes(lowerType)) {
    return 'string';
  }
  
  if (['int', 'integer', 'float', 'double', 'decimal', 'number', 'num', 'numeric'].includes(lowerType)) {
    return 'number';
  }
  
  if (['date', 'datetime', 'timestamp', 'time'].includes(lowerType)) {
    return 'date';
  }
  
  if (['bool', 'boolean'].includes(lowerType)) {
    return 'boolean';
  }
  
  if (['object', 'json', 'map'].includes(lowerType)) {
    return 'object';
  }
  
  if (['array', 'list'].includes(lowerType)) {
    return 'array';
  }
  
  if (['text'].includes(lowerType)) {
    return 'text';
  }
  
  // Default to unknown for unsupported types
  return 'unknown';
}

/**
 * Standardize schema columns for consistency across the workflow
 */
export function standardizeSchemaColumns(columns: {name: string, type: string}[]): SchemaColumn[] {
  if (!columns || !Array.isArray(columns)) {
    return [];
  }
  
  // Create a map to detect duplicates
  const uniqueNames = new Map<string, number>();
  
  const standardizedColumns = columns.map((col, index) => {
    if (!col || !col.name) {
      return { name: `column_${index}`, type: 'string' as const };
    }
    
    const standardName = standardizeColumnName(col.name);
    const standardType = standardizeColumnType(col.type);
    
    // Handle duplicate names by adding suffix
    let finalName = standardName;
    if (uniqueNames.has(standardName)) {
      const count = uniqueNames.get(standardName)! + 1;
      uniqueNames.set(standardName, count);
      finalName = `${standardName}_${count}`;
    } else {
      uniqueNames.set(standardName, 1);
    }
    
    return {
      name: finalName,
      type: standardType
    };
  });
  
  // Explicitly cast to SchemaColumn[] to ensure TypeScript recognizes the correct type
  return standardizedColumns as SchemaColumn[];
}

/**
 * Check if two schemas are compatible (one can be transformed into the other)
 */
export function areSchemaColumnsCompatible(
  sourceSchema: SchemaColumn[],
  targetSchema: SchemaColumn[]
): { compatible: boolean; missingColumns: string[]; typeMismatches: { name: string, sourceType: string, targetType: string }[] } {
  if (!sourceSchema || !targetSchema) {
    return { compatible: false, missingColumns: [], typeMismatches: [] };
  }
  
  const sourceColMap = new Map<string, SchemaColumn>();
  sourceSchema.forEach(col => {
    sourceColMap.set(col.name, col);
  });
  
  const missingColumns: string[] = [];
  const typeMismatches: { name: string, sourceType: string, targetType: string }[] = [];
  
  // Check each target column against source
  targetSchema.forEach(targetCol => {
    const sourceCol = sourceColMap.get(targetCol.name);
    
    if (!sourceCol) {
      missingColumns.push(targetCol.name);
      return;
    }
    
    // Check if types are compatible
    const sourceType = standardizeColumnType(sourceCol.type);
    const targetType = standardizeColumnType(targetCol.type);
    
    if (sourceType !== targetType) {
      typeMismatches.push({
        name: targetCol.name,
        sourceType,
        targetType
      });
    }
  });
  
  return {
    compatible: missingColumns.length === 0 && typeMismatches.length === 0,
    missingColumns,
    typeMismatches
  };
}

/**
 * Estimate the cost of converting from one schema to another
 */
export function estimateSchemaConversionCost(
  sourceSchema: SchemaColumn[],
  targetSchema: SchemaColumn[]
): { 
  conversionCost: number; 
  columnAdditions: number; 
  columnRemovals: number; 
  typeConversions: number;
} {
  if (!sourceSchema || !targetSchema) {
    return { conversionCost: Infinity, columnAdditions: 0, columnRemovals: 0, typeConversions: 0 };
  }
  
  const sourceColMap = new Map<string, SchemaColumn>();
  sourceSchema.forEach(col => {
    sourceColMap.set(col.name, col);
  });
  
  const targetColMap = new Map<string, SchemaColumn>();
  targetSchema.forEach(col => {
    targetColMap.set(col.name, col);
  });
  
  // Calculate metrics
  let columnAdditions = 0;
  let columnRemovals = 0;
  let typeConversions = 0;
  
  // Find columns to add (in target but not in source)
  targetSchema.forEach(targetCol => {
    if (!sourceColMap.has(targetCol.name)) {
      columnAdditions++;
    }
  });
  
  // Find columns to remove and type conversions needed
  sourceSchema.forEach(sourceCol => {
    const targetCol = targetColMap.get(sourceCol.name);
    
    if (!targetCol) {
      columnRemovals++;
    } else {
      // Check for type conversion
      const sourceType = standardizeColumnType(sourceCol.type);
      const targetType = standardizeColumnType(targetCol.type);
      
      if (sourceType !== targetType) {
        typeConversions++;
      }
    }
  });
  
  // Calculate overall cost
  // This is a heuristic - you might want to adjust the weights
  const conversionCost = columnAdditions * 2 + columnRemovals + typeConversions * 1.5;
  
  return {
    conversionCost,
    columnAdditions,
    columnRemovals,
    typeConversions
  };
}
