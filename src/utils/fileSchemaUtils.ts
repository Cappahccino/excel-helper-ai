
import { supabase } from '@/integrations/supabase/client';
import { WorkflowFileSchema } from '@/components/workflow/context/WorkflowContext';
import { toast } from 'sonner';
import { Json } from '@/types/workflow';

// Function to extract data types from sample data
export const detectDataTypes = (sampleData: any[]): Record<string, string> => {
  if (!sampleData || sampleData.length === 0) return {};

  const firstRow = sampleData[0];
  const dataTypes: Record<string, string> = {};

  // Process all keys in the first row
  for (const key in firstRow) {
    const value = firstRow[key];
    
    if (value === null || value === undefined) {
      dataTypes[key] = 'unknown';
      continue;
    }

    const type = typeof value;
    
    if (type === 'number') {
      dataTypes[key] = 'number';
    } else if (type === 'boolean') {
      dataTypes[key] = 'boolean';
    } else if (type === 'object') {
      if (Array.isArray(value)) {
        dataTypes[key] = 'array';
      } else {
        dataTypes[key] = 'object';
      }
    } else if (type === 'string') {
      // Try to detect dates
      if (!isNaN(Date.parse(value)) && 
          (value.includes('-') || value.includes('/')) && 
          (value.split('-').length === 3 || value.split('/').length === 3)) {
        dataTypes[key] = 'date';
      } else {
        dataTypes[key] = 'string';
      }
    } else {
      dataTypes[key] = type;
    }
  }

  return dataTypes;
};

// Function to get columns from sample data
export const extractColumns = (sampleData: any[]): string[] => {
  if (!sampleData || sampleData.length === 0) return [];
  
  // Use the keys from the first row
  return Object.keys(sampleData[0]);
};

// Function to create a new file schema in the database
export const createFileSchema = async (
  workflowId: string,
  nodeId: string,
  fileId: string,
  sampleData: any[],
  sheetName?: string,
  hasHeaders: boolean = true
): Promise<WorkflowFileSchema | null> => {
  try {
    const columns = extractColumns(sampleData);
    const dataTypes = detectDataTypes(sampleData);
    
    const schema: WorkflowFileSchema = {
      workflow_id: workflowId,
      node_id: nodeId,
      file_id: fileId,
      columns,
      data_types: dataTypes as Json,
      sample_data: sampleData.slice(0, 10) as Json[],
      has_headers: hasHeaders,
      sheet_name: sheetName || null
    };

    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .insert(schema)
      .select('*')
      .single();

    if (error) {
      console.error('Error creating file schema:', error);
      toast.error('Failed to save file schema');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createFileSchema:', error);
    toast.error('An error occurred while saving file schema');
    return null;
  }
};

// Function to update an existing file schema
export const updateFileSchema = async (
  schemaId: string,
  updates: Partial<WorkflowFileSchema>
): Promise<WorkflowFileSchema | null> => {
  try {
    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .update(updates)
      .eq('id', schemaId)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating file schema:', error);
      toast.error('Failed to update file schema');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in updateFileSchema:', error);
    toast.error('An error occurred while updating file schema');
    return null;
  }
};

// Function to fetch a file schema by node ID
export const getFileSchemaByNodeId = async (
  workflowId: string, 
  nodeId: string
): Promise<WorkflowFileSchema | null> => {
  try {
    const { data, error } = await supabase
      .from('workflow_file_schemas')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') { // Not found error
        console.error('Error fetching file schema:', error);
      }
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getFileSchemaByNodeId:', error);
    return null;
  }
};

// Function to parse Excel/CSV columns from file metadata
export const getColumnsFromFileMetadata = async (fileId: string): Promise<string[] | null> => {
  try {
    const { data, error } = await supabase
      .from('file_metadata')
      .select('column_definitions')
      .eq('file_id', fileId)
      .single();

    if (error) {
      console.error('Error fetching file metadata:', error);
      return null;
    }

    if (data && data.column_definitions) {
      // Extract column names from column_definitions
      return Object.keys(data.column_definitions);
    }

    return null;
  } catch (error) {
    console.error('Error in getColumnsFromFileMetadata:', error);
    return null;
  }
};

// Function to convert a database schema to a form that the frontend can use
export const convertSchemaForFrontend = (schema: WorkflowFileSchema): Record<string, any> => {
  return {
    headers: schema.columns,
    preview_data: schema.sample_data,
    selected_sheet: schema.sheet_name,
    row_count: schema.total_rows
  };
};
