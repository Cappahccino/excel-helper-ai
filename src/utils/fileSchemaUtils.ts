
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/types/workflow';
import { WorkflowFileSchema } from '@/components/workflow/context/WorkflowContext';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { retryOperation } from '@/utils/retryUtils';
import { toast } from 'sonner';

// Schema cache entry with metadata
interface SchemaCacheEntry {
  schema: WorkflowFileSchema;
  timestamp: number;
  source: 'database' | 'propagation' | 'manual';
  sheetName?: string;
}

// Schema cache with expiration for better performance
const schemaCache: Record<string, SchemaCacheEntry> = {};

// Cache TTL in milliseconds (5 minutes)
const SCHEMA_CACHE_TTL = 5 * 60 * 1000;

// Generate cache key for different schema types
function generateCacheKey(fileId: string, nodeId?: string, workflowId?: string, sheetName?: string): string {
  if (fileId && nodeId && workflowId) {
    return `node-${workflowId}-${nodeId}-${sheetName || 'default'}`;
  } else if (fileId) {
    return `file-${fileId}-${sheetName || 'default'}`;
  }
  return `${fileId}-${nodeId}-${workflowId}-${sheetName || 'default'}`;
}

export async function getFileMetadata(fileId: string, sheetName?: string): Promise<WorkflowFileSchema | null> {
  try {
    // Check cache first
    const cacheKey = generateCacheKey(fileId, undefined, undefined, sheetName);
    const cachedSchema = schemaCache[cacheKey];
    
    if (cachedSchema && (Date.now() - cachedSchema.timestamp) < SCHEMA_CACHE_TTL) {
      console.log(`Using cached schema for file ${fileId}, sheet ${sheetName || 'default'}`);
      return cachedSchema.schema;
    }
    
    console.log(`Fetching file metadata for file ${fileId}, sheet ${sheetName || 'default'}`);
    
    // Use retry operation for more resilient fetching
    const response = await retryOperation(
      async () => {
        const { data, error } = await supabase
          .from('file_metadata')
          .select('column_definitions, sheets_metadata')
          .eq('file_id', fileId)
          .maybeSingle();
        
        if (error) throw error;
        return { data, error };
      },
      {
        maxRetries: 3,
        delay: 500,
        onRetry: (err, attempt) => console.log(`Retrying file metadata fetch (${attempt}/3): ${err.message}`)
      }
    );
      
    if (!response.data) {
      console.error('Error fetching file metadata or no data found');
      return null;
    }
    
    // If a specific sheet is requested, check if it exists in sheets_metadata
    let columnDefinitions = response.data.column_definitions;
    
    if (sheetName && response.data.sheets_metadata) {
      // Find the requested sheet in sheets_metadata
      const sheetData = Array.isArray(response.data.sheets_metadata) 
        ? response.data.sheets_metadata.find((sheet: any) => sheet.name === sheetName)
        : null;
        
      if (sheetData) {
        // If we have specific column definitions for this sheet, use them
        // This might be implemented in a future enhancement
        // For now, we'll continue using the general column_definitions
      }
    }
    
    const schema = {
      columns: Object.keys(columnDefinitions),
      types: columnDefinitions as Record<string, string>
    };
    
    // Update cache
    schemaCache[cacheKey] = {
      schema,
      timestamp: Date.now(),
      source: 'database',
      sheetName
    };
    
    return schema;
  } catch (error) {
    console.error('Error in getFileMetadata:', error);
    return null;
  }
}

export async function getNodeSchema(
  workflowId: string,
  nodeId: string,
  options: { forceRefresh?: boolean, sheetName?: string } = {}
): Promise<WorkflowFileSchema | null> {
  try {
    const { forceRefresh = false, sheetName = 'Sheet1' } = options;
    
    // Handle temporary workflow IDs
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    // Generate cache key that includes sheet name
    const cacheKey = generateCacheKey('', nodeId, dbWorkflowId, sheetName);
    
    // Check cache first unless force refresh is requested
    if (!forceRefresh && schemaCache[cacheKey] && (Date.now() - schemaCache[cacheKey].timestamp) < SCHEMA_CACHE_TTL) {
      console.log(`Using cached schema for node ${nodeId}, sheet ${sheetName}`);
      return schemaCache[cacheKey].schema;
    }
    
    console.log(`Fetching schema for node ${nodeId} in workflow ${dbWorkflowId}, sheet ${sheetName}`);
    
    const response = await retryOperation(
      async () => {
        const { data, error } = await supabase
          .from('workflow_file_schemas')
          .select('columns, data_types, file_id')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', nodeId)
          .eq('sheet_name', sheetName)
          .maybeSingle();
        
        if (error) throw error;
        return { data, error };
      },
      {
        maxRetries: 3,
        delay: 500,
        onRetry: (err, attempt) => console.log(`Retrying schema fetch (${attempt}/3): ${err.message}`)
      }
    );
    
    if (!response.data || !response.data.columns) {
      console.log(`No schema found for node ${nodeId}, sheet ${sheetName}`);
      
      // Try to fetch the schema for the default sheet if a non-default sheet was requested
      if (sheetName !== 'Sheet1') {
        console.log(`Trying default sheet (Sheet1) for node ${nodeId}`);
        return await getNodeSchema(workflowId, nodeId, { forceRefresh, sheetName: 'Sheet1' });
      }
      
      return null;
    }
    
    // Validate schema structure
    if (!Array.isArray(response.data.columns) || !response.data.data_types) {
      console.warn(`Invalid schema structure for node ${nodeId}, sheet ${sheetName}:`, response.data);
      return null;
    }
    
    // Convert to WorkflowFileSchema format
    const schema: WorkflowFileSchema = {
      columns: response.data.columns,
      types: response.data.data_types as Record<string, string>
    };
    
    // Update cache
    schemaCache[cacheKey] = {
      schema,
      timestamp: Date.now(),
      source: 'database',
      sheetName
    };
    
    return schema;
  } catch (error) {
    console.error('Error in getNodeSchema:', error);
    return null;
  }
}

export async function updateNodeSchema(
  workflowId: string,
  nodeId: string,
  fileId: string,
  schema: WorkflowFileSchema,
  sheetName: string = 'Sheet1'
): Promise<boolean> {
  try {
    console.log(`Updating schema for node ${nodeId} in workflow ${workflowId}, sheet ${sheetName}`);
    console.log('Schema data:', schema);
    
    const result = await retryOperation(
      async () => {
        const { error } = await supabase
          .from('workflow_file_schemas')
          .upsert({
            workflow_id: workflowId,
            node_id: nodeId,
            file_id: fileId,
            sheet_name: sheetName,
            columns: schema.columns,
            data_types: schema.types,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'workflow_id,node_id,sheet_name'
          });
        
        if (error) throw error;
        return { error };
      },
      {
        maxRetries: 2,
        delay: 300
      }
    );
      
    if (result.error) {
      console.error('Error updating node schema:', result.error);
      return false;
    }
    
    // Update cache with new schema
    const cacheKey = generateCacheKey('', nodeId, workflowId, sheetName);
    schemaCache[cacheKey] = {
      schema,
      timestamp: Date.now(),
      source: 'database',
      sheetName
    };
    
    console.log(`Schema updated successfully for node ${nodeId}, sheet ${sheetName}`);
    return true;
  } catch (error) {
    console.error('Error in updateNodeSchema:', error);
    return false;
  }
}

/**
 * Convert WorkflowFileSchema to SchemaColumn array
 */
export function convertToSchemaColumns(schema: WorkflowFileSchema): SchemaColumn[] {
  if (!schema.columns || !Array.isArray(schema.columns)) {
    console.warn('Invalid schema format in convertToSchemaColumns:', schema);
    return [];
  }
  
  return schema.columns.map(column => ({
    name: column,
    type: schema.types[column] as 'string' | 'text' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown'
  }));
}

/**
 * Convert SchemaColumn array to WorkflowFileSchema
 */
export function convertFromSchemaColumns(columns: SchemaColumn[]): WorkflowFileSchema {
  const types = columns.reduce((acc, col) => {
    acc[col.name] = col.type;
    return acc;
  }, {} as Record<string, string>);
  
  return {
    columns: columns.map(col => col.name),
    types
  };
}

/**
 * Propagate schema between connected nodes
 */
export async function propagateSchema(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  schema: SchemaColumn[],
  sheetName: string = 'Sheet1'
): Promise<boolean> {
  try {
    console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}, sheet ${sheetName}`);
    
    // Convert SchemaColumn array to workflow_file_schemas format
    const columns = schema.map(col => col.name);
    const dataTypes = schema.reduce((acc, col) => {
      acc[col.name] = col.type;
      return acc;
    }, {} as Record<string, string>);
    
    const result = await retryOperation(
      async () => {
        const { error } = await supabase
          .from('workflow_file_schemas')
          .upsert({
            workflow_id: workflowId,
            node_id: targetNodeId,
            file_id: '00000000-0000-0000-0000-000000000000', // Placeholder for propagated schema
            sheet_name: sheetName,
            columns,
            data_types: dataTypes,
            is_temporary: false,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'workflow_id,node_id,sheet_name'
          });
          
        if (error) throw error;
        return { error };
      },
      {
        maxRetries: 3,
        delay: 500,
        onRetry: (err, attempt) => console.log(`Retrying schema propagation (${attempt}/3): ${err.message}`)
      }
    );
    
    if (result.error) {
      console.error('Error in schema propagation:', result.error);
      return false;
    }
    
    // Update cache with propagated schema
    const cacheKey = generateCacheKey('', targetNodeId, workflowId, sheetName);
    schemaCache[cacheKey] = {
      schema: { columns, types: dataTypes },
      timestamp: Date.now(),
      source: 'propagation',
      sheetName
    };
    
    console.log(`Schema propagated successfully to ${targetNodeId}, sheet ${sheetName}`);
    return true;
  } catch (error) {
    console.error('Error in propagateSchema:', error);
    return false;
  }
}

/**
 * Retrieve schema from a source node that connects to the target node
 */
export async function getSourceNodeSchema(
  workflowId: string, 
  targetNodeId: string,
  sheetName: string = 'Sheet1'
): Promise<WorkflowFileSchema | null> {
  try {
    // First, find edges that connect to this target node
    const { data: edges, error: edgesError } = await supabase
      .from('workflow_edges')
      .select('source_node_id')
      .eq('workflow_id', workflowId)
      .eq('target_node_id', targetNodeId);
      
    if (edgesError || !edges || edges.length === 0) {
      console.log(`No incoming edges found for node ${targetNodeId}`);
      return null;
    }
    
    // Get the first source node
    const sourceNodeId = edges[0].source_node_id;
    
    // Get the sheet name from the source node's configuration if available
    const { data: sourceNodeConfig, error: configError } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', workflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    // Use the source node's selected sheet if available, otherwise use the provided sheet name
    const sourceSheetName = sourceNodeConfig?.metadata?.selected_sheet || sheetName;
    
    // Now get the schema from the source node with the determined sheet
    return await getNodeSchema(workflowId, sourceNodeId, { sheetName: sourceSheetName });
  } catch (error) {
    console.error('Error getting source node schema:', error);
    return null;
  }
}

/**
 * Get available sheets for a file in a workflow node
 */
export async function getAvailableSheets(
  workflowId: string,
  nodeId: string
): Promise<{ name: string, index: number, rowCount: number, isDefault: boolean }[] | null> {
  try {
    const { data: workflowFile, error: fileError } = await supabase
      .from('workflow_files')
      .select('file_id, metadata')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (fileError || !workflowFile?.file_id) {
      console.error('Error fetching workflow file:', fileError);
      return null;
    }
    
    // Check if metadata already has sheets information
    if (workflowFile.metadata?.sheets && Array.isArray(workflowFile.metadata.sheets)) {
      return workflowFile.metadata.sheets.map((sheet: any) => ({
        name: sheet.name,
        index: sheet.index,
        rowCount: sheet.row_count || 0,
        isDefault: sheet.is_default || false
      }));
    }
    
    // Fetch from file_metadata as fallback
    const { data: fileMetadata, error: metadataError } = await supabase
      .from('file_metadata')
      .select('sheets_metadata')
      .eq('file_id', workflowFile.file_id)
      .maybeSingle();
      
    if (metadataError || !fileMetadata?.sheets_metadata) {
      console.error('Error fetching file metadata:', metadataError);
      return null;
    }
    
    return Array.isArray(fileMetadata.sheets_metadata) 
      ? fileMetadata.sheets_metadata.map((sheet: any) => ({
          name: sheet.name,
          index: sheet.index,
          rowCount: sheet.row_count || 0,
          isDefault: sheet.is_default || false
        }))
      : null;
  } catch (error) {
    console.error('Error in getAvailableSheets:', error);
    return null;
  }
}

/**
 * Set the selected sheet for a node
 */
export async function setSelectedSheet(
  workflowId: string,
  nodeId: string,
  sheetName: string
): Promise<boolean> {
  try {
    console.log(`Setting selected sheet ${sheetName} for node ${nodeId} in workflow ${workflowId}`);
    
    // Update the workflow_files record with the new selected sheet
    const { error: updateError } = await supabase
      .from('workflow_files')
      .update({
        metadata: supabase.rpc('jsonb_set_deep', {
          target: 'metadata',
          path: ['selected_sheet'],
          value: sheetName
        }),
        updated_at: new Date().toISOString()
      })
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId);
      
    if (updateError) {
      console.error('Error updating selected sheet:', updateError);
      return false;
    }
    
    console.log(`Selected sheet updated successfully for node ${nodeId}`);
    return true;
  } catch (error) {
    console.error('Error in setSelectedSheet:', error);
    return false;
  }
}

/**
 * Clear the schema cache for specific nodes or the entire cache
 */
export function clearSchemaCache(options?: { 
  workflowId?: string; 
  nodeId?: string;
  fileId?: string;
  sheetName?: string;
}) {
  if (!options) {
    // Clear entire cache
    Object.keys(schemaCache).forEach(key => delete schemaCache[key]);
    console.log('Cleared entire schema cache');
    return;
  }
  
  const { workflowId, nodeId, fileId, sheetName } = options;
  
  // Handle temporary workflow IDs
  const dbWorkflowId = workflowId?.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  
  Object.keys(schemaCache).forEach(key => {
    if (
      (dbWorkflowId && key.includes(`-${dbWorkflowId}-`)) ||
      (nodeId && key.includes(`-${nodeId}-`)) ||
      (fileId && key.includes(`-${fileId}-`)) ||
      (sheetName && key.includes(`-${sheetName}`))
    ) {
      delete schemaCache[key];
      console.log(`Cleared cache for key: ${key}`);
    }
  });
}
