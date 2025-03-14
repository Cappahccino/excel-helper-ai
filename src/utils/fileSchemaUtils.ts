
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';

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

// Schema cache with expiration for better performance
const schemaCache = new Map<string, SchemaCacheEntry>();

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
 * Generate a unique cache key for schema entries
 * Includes sheet name to ensure sheet-specific caching
 */
function getCacheKey(workflowId: string, nodeId: string, sheetName?: string): string {
  return `${workflowId}:${nodeId}:${sheetName || 'default'}`;
}

/**
 * Clear schema cache entry for a specific node
 */
export function clearSchemaCache({ workflowId, nodeId, sheetName }: { 
  workflowId: string, 
  nodeId: string, 
  sheetName?: string 
}): void {
  // If sheet name is provided, clear only that specific sheet's cache
  if (sheetName) {
    const key = getCacheKey(workflowId, nodeId, sheetName);
    if (schemaCache.delete(key)) {
      console.log(`Schema cache cleared for ${key}`);
    }
  } else {
    // Clear all sheet caches for this node by iterating and finding matching keys
    const keyPrefix = `${workflowId}:${nodeId}:`;
    const keysToDelete = Array.from(schemaCache.keys()).filter(k => k.startsWith(keyPrefix));
    
    keysToDelete.forEach(key => {
      schemaCache.delete(key);
      console.log(`Schema cache cleared for ${key}`);
    });
  }
}

/**
 * Get schema for a specific node in the workflow
 */
export async function getNodeSchema(
  workflowId: string, 
  nodeId: string, 
  options: { forceRefresh?: boolean, sheetName?: string } = {}
): Promise<any> {
  try {
    // Check for temporary workflow ID and convert if needed
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
    
    // Default options
    const { forceRefresh = false, sheetName } = options;
    
    // If no sheet name provided, try to get the selected sheet from workflow_files metadata
    let effectiveSheetName = sheetName;
    if (!effectiveSheetName) {
      const { data: nodeFile } = await supabase
        .from('workflow_files')
        .select('metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      const metadata = nodeFile?.metadata as FileMetadata | null;
      effectiveSheetName = metadata?.selected_sheet || 'Sheet1';
      
      console.log(`Retrieved selected sheet from metadata: ${effectiveSheetName}`);
    }
    
    // Generate cache key including the sheet name
    const cacheKey = getCacheKey(workflowId, nodeId, effectiveSheetName);
    
    // Check cache first if not forcing refresh
    if (!forceRefresh && schemaCache.has(cacheKey)) {
      const cachedEntry = schemaCache.get(cacheKey);
      
      if (cachedEntry && (Date.now() - cachedEntry.timestamp) < DEFAULT_CACHE_TTL) {
        console.log(`Using cached schema for ${cacheKey}`);
        return cachedEntry.schema;
      }
    }
    
    console.log(`Fetching schema from database for ${nodeId} in workflow ${dbWorkflowId}, sheet ${effectiveSheetName}`);
    
    // Fetch schema from workflow_file_schemas table for the specific sheet
    const { data: schemaData, error: schemaError } = await supabase
      .from('workflow_file_schemas')
      .select('columns, data_types, file_id, has_headers, total_rows, sample_data')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('sheet_name', effectiveSheetName)
      .maybeSingle();
    
    if (schemaError) {
      console.error('Error fetching node schema:', schemaError);
      return null;
    }
    
    if (schemaData) {
      // Add sheet name to the schema data for context
      const schemaWithSheet = {
        ...schemaData,
        sheet_name: effectiveSheetName
      };
      
      // Store in cache
      const cacheEntry: SchemaCacheEntry = {
        schema: schemaWithSheet,
        timestamp: Date.now(),
        source: 'database',
        sheetName: effectiveSheetName
      };
      
      schemaCache.set(cacheKey, cacheEntry);
      
      console.log(`Schema found for ${nodeId} in workflow ${dbWorkflowId}, sheet ${effectiveSheetName}`);
      return schemaWithSheet;
    }
    
    // If no schema is found for this specific sheet, check if we need to try with Sheet1 as fallback
    if (effectiveSheetName !== 'Sheet1' && !schemaData) {
      console.log(`No schema found for sheet ${effectiveSheetName}, trying default Sheet1`);
      return await getNodeSchema(workflowId, nodeId, { forceRefresh, sheetName: 'Sheet1' });
    }
    
    console.log(`Schema not found for ${nodeId} in workflow ${dbWorkflowId}, sheet ${effectiveSheetName}`);
    return null;
  } catch (error) {
    console.error('Error in getNodeSchema:', error);
    return null;
  }
}

/**
 * Helper function to get source node schema with proper handling for sheet selection
 */
export async function getSourceNodeSchema(
  workflowId: string, 
  sourceNodeId: string, 
  sheetName?: string
) {
  try {
    // Check for temporary workflow ID and convert if needed
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
    
    // Get source node's configuration to find selected sheet
    const { data: sourceNodeConfig } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    // Use the source node's selected sheet if available, otherwise use the provided sheet name
    const metadata = sourceNodeConfig?.metadata as FileMetadata | null;
    const sourceSheetName = sheetName || metadata?.selected_sheet || 'Sheet1';
    
    console.log(`Getting source node schema with sheet: ${sourceSheetName}`);
    
    // Now get the schema from the source node with the determined sheet
    return await getNodeSchema(workflowId, sourceNodeId, { sheetName: sourceSheetName });
  } catch (error) {
    console.error('Error in getSourceNodeSchema:', error);
    return null;
  }
}

/**
 * Propagate schema from source node to target node
 */
export async function propagateSchema(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    console.log(`Propagating schema: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'default'}`);
    
    // Get schema from source node
    const sourceSchema = await getSourceNodeSchema(workflowId, sourceNodeId, sheetName);
    if (!sourceSchema) {
      console.error(`No schema available for source node ${sourceNodeId}`);
      return false;
    }
    
    // Check for temporary workflow ID and convert if needed
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
    
    // Get source sheet name - this may have been retrieved from the source node's metadata
    const sourceSheetName = sourceSchema.sheet_name || sheetName || 'Sheet1';
    
    // Update target node schema
    const { error } = await supabase
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: dbWorkflowId,
        node_id: targetNodeId,
        file_id: sourceSchema.file_id || '00000000-0000-0000-0000-000000000000',
        sheet_name: sourceSheetName,
        columns: sourceSchema.columns,
        data_types: sourceSchema.data_types,
        sample_data: sourceSchema.sample_data || [],
        total_rows: sourceSchema.total_rows || 0,
        has_headers: sourceSchema.has_headers !== undefined ? sourceSchema.has_headers : true,
        is_temporary: workflowId.startsWith('temp-'),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id,sheet_name'
      });
    
    if (error) {
      console.error('Error propagating schema:', error);
      return false;
    }
    
    // Also update target node's selected sheet in metadata
    const { data: targetFile } = await supabase
      .from('workflow_files')
      .select('metadata, file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
    
    if (targetFile) {
      const targetMetadata = targetFile.metadata as FileMetadata | null || {};
      const updatedMetadata = {
        ...targetMetadata,
        selected_sheet: sourceSheetName
      };
      
      await supabase
        .from('workflow_files')
        .update({ metadata: updatedMetadata })
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', targetNodeId);
    }
    
    // Cache the propagated schema for the target node
    const targetCacheKey = getCacheKey(workflowId, targetNodeId, sourceSheetName);
    schemaCache.set(targetCacheKey, {
      schema: sourceSchema,
      timestamp: Date.now(),
      source: 'propagation',
      sheetName: sourceSheetName
    });
    
    console.log(`Schema propagated successfully to ${targetNodeId} with sheet ${sourceSheetName}`);
    return true;
  } catch (error) {
    console.error('Error in propagateSchema:', error);
    return false;
  }
}

/**
 * Get available sheets for a node based on its associated file
 */
export async function getNodeSheets(workflowId: string, nodeId: string) {
  try {
    // Check for temporary workflow ID and convert if needed
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
    
    console.log(`Getting sheets for node ${nodeId} in workflow ${dbWorkflowId}`);
    
    // Get the workflow file association
    const { data: workflowFile, error } = await supabase
      .from('workflow_files')
      .select('file_id, metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
    
    if (error || !workflowFile) {
      console.error('Error fetching workflow file:', error);
      return null;
    }
    
    // Check if metadata already has sheets information
    const metadata = workflowFile.metadata as FileMetadata | null;
    if (metadata?.sheets && Array.isArray(metadata.sheets)) {
      return metadata.sheets.map((sheet: any) => ({
        name: sheet.name,
        index: sheet.index,
        rowCount: sheet.row_count || sheet.rowCount || 0,
        isDefault: sheet.is_default || sheet.isDefault || false
      }));
    }
    
    // If no sheets in metadata, fetch file_metadata
    const { data: fileMetadata } = await supabase
      .from('file_metadata')
      .select('sheets_metadata')
      .eq('file_id', workflowFile.file_id)
      .maybeSingle();
    
    if (fileMetadata?.sheets_metadata && Array.isArray(fileMetadata.sheets_metadata)) {
      return fileMetadata.sheets_metadata.map((sheet: any) => ({
        name: sheet.name,
        index: sheet.index,
        rowCount: sheet.row_count || 0,
        isDefault: sheet.is_default || false
      }));
    }
    
    console.log('No sheets found for this node');
    return [];
  } catch (error) {
    console.error('Error fetching node sheets:', error);
    return [];
  }
}

/**
 * Update the selected sheet for a node
 */
export async function setNodeSelectedSheet(
  workflowId: string, 
  nodeId: string, 
  sheetName: string
): Promise<boolean> {
  try {
    // Check for temporary workflow ID and convert if needed
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
    
    console.log(`Setting selected sheet ${sheetName} for node ${nodeId} in workflow ${workflowId}`);
    
    // Get current metadata
    const { data: currentFile } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
    
    const currentMetadata = (currentFile?.metadata as FileMetadata) || {};
    
    // Update the workflow_files record with the new selected sheet
    // We need to preserve other metadata fields
    const { error: updateError } = await supabase
      .from('workflow_files')
      .update({
        metadata: {
          ...currentMetadata,
          selected_sheet: sheetName
        }
      })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId);
    
    if (updateError) {
      console.error('Error updating selected sheet:', updateError);
      toast.error('Failed to update selected sheet');
      return false;
    }
    
    // Clear cache for this node to ensure fresh data is fetched
    clearSchemaCache({ workflowId, nodeId });
    
    console.log(`Selected sheet updated to ${sheetName}`);
    toast.success(`Sheet "${sheetName}" selected`);
    return true;
  } catch (error) {
    console.error('Error in setNodeSelectedSheet:', error);
    toast.error('Failed to set selected sheet');
    return false;
  }
}

/**
 * Get sheet selection for a node
 */
export async function getNodeSelectedSheet(
  workflowId: string, 
  nodeId: string
): Promise<string | null> {
  try {
    // Check for temporary workflow ID and convert if needed
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
    
    // Get the workflow file association
    const { data: workflowFile, error } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
    
    if (error || !workflowFile) {
      console.error('Error fetching workflow file:', error);
      return null;
    }
    
    const metadata = workflowFile.metadata as FileMetadata | null;
    return metadata?.selected_sheet || null;
  } catch (error) {
    console.error('Error in getNodeSelectedSheet:', error);
    return null;
  }
}

/**
 * Validate if node has a valid schema for a specific sheet
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
    
    // Determine sheet name to validate
    let effectiveSheetName = sheetName;
    if (!effectiveSheetName) {
      const { data: nodeFile } = await supabase
        .from('workflow_files')
        .select('metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
        
      const metadata = nodeFile?.metadata as FileMetadata | null;
      effectiveSheetName = metadata?.selected_sheet || 'Sheet1';
    }
    
    // Check if schema exists for this sheet
    const { data: schemaData, error: schemaError } = await supabase
      .from('workflow_file_schemas')
      .select('columns')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('sheet_name', effectiveSheetName)
      .maybeSingle();
    
    if (schemaError) {
      return { isValid: false, message: `Error fetching schema: ${schemaError.message}` };
    }
    
    if (!schemaData || !schemaData.columns || schemaData.columns.length === 0) {
      return { isValid: false, message: `No schema found for sheet "${effectiveSheetName}"` };
    }
    
    return { isValid: true };
  } catch (error) {
    console.error(`Error validating node sheet schema:`, error);
    return { isValid: false, message: `Validation error: ${error.message}` };
  }
}
