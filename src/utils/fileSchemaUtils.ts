import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';
import { 
  cacheSchema, 
  getSchemaFromCache, 
  invalidateSchemaCache 
} from './schema';

// Type definitions for schema cache
interface SchemaCacheEntry {
  schema: any;
  timestamp: number;
  source: 'database' | 'propagation' | 'manual';
  sheetName?: string;
}

// Type definitions for metadata objects
interface FileMetadata {
  selected_sheet?: string;
  sheets?: Array<{
    name: string;
    index: number;
    row_count?: number; // Match the database camelCase or snake_case
    rowCount?: number;
    is_default?: boolean;
    isDefault?: boolean;
    column_count?: number;
  }>;
  [key: string]: any;
}

// Type definition for sheet metadata
export interface SheetMetadata {
  name: string;
  index: number;
  rowCount: number;
  isDefault: boolean;
}

// Default time-to-live for cache entries in milliseconds (5 minutes)
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Convert database-retrieved schema to a more usable format
 */
export function convertToSchemaColumns(schema: any): SchemaColumn[] {
  if (!schema || !schema.columns || !schema.data_types) {
    return [];
  }

  return schema.columns.map((column: string) => ({
    name: column,
    type: schema.data_types[column] || 'string'
  }));
}

/**
 * Get schema for a specific node
 */
export async function getNodeSchema(
  workflowId: string, 
  nodeId: string, 
  options?: { 
    forceRefresh?: boolean,
    maxCacheAge?: number,
    sheetName?: string
  }
): Promise<any> {
  const { forceRefresh = false, maxCacheAge = DEFAULT_CACHE_TTL, sheetName } = options || {};
  
  // Try cache first when not forcing refresh
  if (!forceRefresh) {
    const cachedSchema = await getSchemaFromCache(workflowId, nodeId, {
      maxAge: maxCacheAge,
      sheetName
    });
    
    if (cachedSchema) {
      return {
        columns: cachedSchema.map(col => col.name),
        data_types: cachedSchema.reduce((acc, col) => {
          acc[col.name] = col.type;
          return acc;
        }, {} as Record<string, string>)
      };
    }
  }
  
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Create query for schema
    let query = supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId);
      
    // Add sheet filter if provided
    if (sheetName) {
      query = query.eq('sheet_name', sheetName);
    }
    
    const { data, error } = await query.maybeSingle();
    
    if (error) {
      console.error('Error fetching schema:', error);
      return null;
    }
    
    if (!data) {
      return null;
    }
    
    // Cache the schema
    const schema = convertToSchemaColumns(data);
    if (schema.length > 0) {
      cacheSchema(workflowId, nodeId, schema, {
        source: 'database',
        sheetName
      });
    }
    
    return data;
  } catch (error) {
    console.error('Error in getNodeSchema:', error);
    return null;
  }
}

/**
 * Get the selected sheet for a node
 */
export async function getNodeSelectedSheet(workflowId: string, nodeId: string): Promise<string | null> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // First check workflow_files table for node metadata
    const { data: fileData, error: fileError } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (fileData?.metadata && typeof fileData.metadata === 'object' && !Array.isArray(fileData.metadata)) {
      const metadata = fileData.metadata as FileMetadata;
      if (metadata.selected_sheet) {
        return metadata.selected_sheet;
      }
    }
    
    // If not found, try workflow_file_schemas table
    const { data: schemaData, error: schemaError } = await supabase
      .from('workflow_file_schemas')
      .select('sheet_name')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (schemaData?.sheet_name) {
      return schemaData.sheet_name;
    }
    
    return null;
  } catch (error) {
    console.error('Error in getNodeSelectedSheet:', error);
    return null;
  }
}

/**
 * Get available sheets for a node
 */
export async function getNodeSheets(workflowId: string, nodeId: string): Promise<SheetMetadata[] | null> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // First, try to get from workflow_files metadata
    const { data: fileData, error: fileError } = await supabase
      .from('workflow_files')
      .select('metadata, file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
    
    if (fileError) {
      console.error('Error fetching workflow file:', fileError);
      return null;
    }
    
    if (fileData?.metadata && typeof fileData.metadata === 'object' && !Array.isArray(fileData.metadata)) {
      const metadata = fileData.metadata as FileMetadata;
      
      if (metadata.sheets && Array.isArray(metadata.sheets)) {
        // Convert to consistent format
        return metadata.sheets.map(sheet => ({
          name: sheet.name,
          index: sheet.index,
          rowCount: sheet.rowCount || sheet.row_count || 0,
          isDefault: sheet.isDefault || sheet.is_default || false
        }));
      }
    }
    
    // If no metadata in workflow_files, try from file_metadata
    if (fileData?.file_id) {
      const { data: metaData, error: metaError } = await supabase
        .from('file_metadata')
        .select('sheets_metadata')
        .eq('file_id', fileData.file_id)
        .maybeSingle();
        
      if (metaError) {
        console.error('Error fetching file metadata:', metaError);
        return null;
      }
      
      if (metaData?.sheets_metadata && Array.isArray(metaData.sheets_metadata)) {
        // Convert to consistent format
        return metaData.sheets_metadata.map((sheet: any) => ({
          name: sheet.name,
          index: sheet.index,
          rowCount: sheet.row_count || sheet.rowCount || 0,
          isDefault: sheet.is_default || sheet.isDefault || false
        }));
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error in getNodeSheets:', error);
    return null;
  }
}

/**
 * Set selected sheet for a node
 */
export async function setNodeSelectedSheet(
  workflowId: string, 
  nodeId: string, 
  sheetName: string
): Promise<boolean> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Get current metadata
    const { data: fileData, error: fileError } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (fileError) {
      console.error('Error fetching workflow file:', fileError);
      return false;
    }
    
    // Update metadata with selected sheet
    const currentMetadata = fileData?.metadata && typeof fileData.metadata === 'object' && !Array.isArray(fileData.metadata)
      ? fileData.metadata 
      : {};
      
    const updatedMetadata = {
      ...currentMetadata,
      selected_sheet: sheetName
    };
    
    // Save updated metadata
    const { error: updateError } = await supabase
      .from('workflow_files')
      .update({ 
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId);
      
    if (updateError) {
      console.error('Error updating selected sheet:', updateError);
      return false;
    }
    
    // Invalidate the schema cache for this node
    invalidateSchemaCache(workflowId, nodeId);
    
    return true;
  } catch (error) {
    console.error('Error in setNodeSelectedSheet:', error);
    return false;
  }
}

/**
 * Validate node sheet schema
 */
export async function validateNodeSheetSchema(
  workflowId: string, 
  nodeId: string, 
  sheetName?: string
): Promise<{ isValid: boolean, message?: string }> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Get the sheet name if not provided
    let effectiveSheetName = sheetName;
    if (!effectiveSheetName) {
      effectiveSheetName = await getNodeSelectedSheet(workflowId, nodeId) || 'Sheet1';
    }
    
    // Check if schema exists for this sheet
    const { data: schema, error } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('sheet_name', effectiveSheetName)
      .maybeSingle();
      
    if (error) {
      return { 
        isValid: false, 
        message: `Error validating schema: ${error.message}` 
      };
    }
    
    if (!schema) {
      return { 
        isValid: false, 
        message: `No schema found for sheet "${effectiveSheetName}"` 
      };
    }
    
    if (!schema.columns || !Array.isArray(schema.columns) || schema.columns.length === 0) {
      return { 
        isValid: false, 
        message: `No columns defined in schema for sheet "${effectiveSheetName}"` 
      };
    }
    
    return { 
      isValid: true 
    };
  } catch (error) {
    console.error('Error in validateNodeSheetSchema:', error);
    return { 
      isValid: false, 
      message: `Validation error: ${(error as Error).message}` 
    };
  }
}

/**
 * Trigger schema refresh from file source
 */
export async function triggerSchemaRefresh(
  workflowId: string,
  nodeId: string,
  options?: {
    sheetName?: string,
    forceProcessing?: boolean
  }
): Promise<boolean> {
  try {
    const { sheetName, forceProcessing = false } = options || {};
    
    // Normalize workflow ID
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    // Get file ID associated with this node  
    const { data: fileData, error: fileError } = await supabase
      .from('workflow_files')
      .select('file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (fileError || !fileData?.file_id) {
      console.error('Error getting file ID:', fileError || 'No file ID found');
      return false;
    }
    
    // Invalidate cache
    invalidateSchemaCache(workflowId, nodeId, sheetName);
    
    if (forceProcessing) {
      // Trigger file processing to refresh schema
      const { error: processError } = await supabase.functions.invoke('processFile', {
        body: {
          fileId: fileData.file_id,
          workflowId,
          nodeId,
          requestedSheetName: sheetName
        }
      });
      
      if (processError) {
        console.error('Error triggering file processing:', processError);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error in triggerSchemaRefresh:', error);
    return false;
  }
}
