
import { supabase } from '@/integrations/supabase/client';
import { FileSchema, createFileSchema } from '@/types/workflow';

/**
 * Determines the data type of a value
 * 
 * @param value - The value to analyze
 * @returns The data type as a string
 */
export function determineDataType(value: any): string {
  if (value === null || value === undefined) return 'unknown';
  
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'decimal';
  }
  
  if (typeof value === 'boolean') return 'boolean';
  
  if (typeof value === 'string') {
    // Check for date format
    if (!isNaN(Date.parse(value)) && value.match(/^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}/)) {
      return 'date';
    }
    return 'string';
  }
  
  if (Array.isArray(value)) return 'array';
  
  if (typeof value === 'object') return 'object';
  
  return 'unknown';
}

/**
 * Analyzes a dataset and returns information about its structure
 * 
 * @param data - Array of data objects
 * @returns Object containing columns and their detected data types
 */
export function analyzeDataStructure(data: any[]): { 
  columns: string[], 
  dataTypes: Record<string, string> 
} {
  if (!data || data.length === 0) {
    return { columns: [], dataTypes: {} };
  }
  
  // Extract all unique column names
  const columns: string[] = Array.from(
    new Set(data.flatMap(row => Object.keys(row)))
  );
  
  // Determine data types for each column
  const dataTypes: Record<string, string> = {};
  
  columns.forEach(column => {
    // Get all non-null values for this column
    const values = data
      .map(row => row[column])
      .filter(value => value !== null && value !== undefined);
    
    if (values.length === 0) {
      dataTypes[column] = 'unknown';
    } else {
      // Get the first non-null value's type
      const firstType = determineDataType(values[0]);
      
      // Check if all values have the same type
      const allSameType = values.every(value => determineDataType(value) === firstType);
      
      if (allSameType) {
        dataTypes[column] = firstType;
      } else {
        // If mixed types, default to string
        dataTypes[column] = 'mixed';
      }
    }
  });
  
  return { columns, dataTypes };
}

/**
 * Extracts schema from file data and saves it to the database
 * 
 * @param fileId - ID of the file
 * @param workflowId - ID of the workflow
 * @param nodeId - ID of the node
 * @param sampleData - Sample data from the file
 * @param hasHeaders - Whether the file has headers
 * @param sheetName - Optional sheet name for Excel files
 * @returns The created or updated file schema
 */
export async function saveFileSchema(
  fileId: string,
  workflowId: string,
  nodeId: string,
  sampleData: any[],
  hasHeaders: boolean = true,
  sheetName?: string
): Promise<FileSchema | null> {
  try {
    // Analyze data structure
    const { columns, dataTypes } = analyzeDataStructure(sampleData);
    
    // Create schema object
    const schemaData = createFileSchema(
      fileId,
      workflowId,
      nodeId,
      columns,
      dataTypes,
      sampleData.slice(0, 10), // Store only first 10 rows as sample
      hasHeaders,
      sheetName
    );
    
    // Check if schema already exists
    const { data: existingSchema, error: checkError } = await supabase
      .from('workflow_file_schemas')
      .select('*')
      .eq('file_id', fileId)
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
    
    if (checkError) {
      console.error('Error checking for existing schema:', checkError);
      return null;
    }
    
    let result;
    
    if (existingSchema) {
      // Update existing schema
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .update({
          columns: schemaData.columns,
          data_types: schemaData.dataTypes,
          sample_data: schemaData.sampleData,
          has_headers: schemaData.hasHeaders,
          sheet_name: schemaData.sheetName,
          total_rows: schemaData.totalRows,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSchema.id)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating file schema:', error);
        return null;
      }
      
      result = data;
    } else {
      // Insert new schema
      const { data, error } = await supabase
        .from('workflow_file_schemas')
        .insert({
          file_id: schemaData.fileId,
          workflow_id: schemaData.workflowId,
          node_id: schemaData.nodeId,
          columns: schemaData.columns,
          data_types: schemaData.dataTypes,
          sample_data: schemaData.sampleData,
          has_headers: schemaData.hasHeaders,
          sheet_name: schemaData.sheetName,
          total_rows: schemaData.totalRows
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating file schema:', error);
        return null;
      }
      
      result = data;
    }
    
    return result as unknown as FileSchema;
  } catch (error) {
    console.error('Error in saveFileSchema:', error);
    return null;
  }
}

/**
 * Retrieves file schema from the database
 * 
 * @param fileId - ID of the file
 * @param workflowId - ID of the workflow
 * @param nodeId - Optional node ID
 * @returns The file schema if found
 */
export async function getFileSchema(
  fileId: string,
  workflowId: string,
  nodeId?: string
): Promise<FileSchema | null> {
  try {
    let query = supabase
      .from('workflow_file_schemas')
      .select('*')
      .eq('file_id', fileId)
      .eq('workflow_id', workflowId);
    
    if (nodeId) {
      query = query.eq('node_id', nodeId);
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error) {
      console.error('Error fetching file schema:', error);
      return null;
    }
    
    return data as unknown as FileSchema;
  } catch (error) {
    console.error('Error in getFileSchema:', error);
    return null;
  }
}
