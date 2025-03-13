import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/types/workflow';
import { WorkflowFileSchema } from '@/components/workflow/context/WorkflowContext';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { retryOperation } from '@/utils/retryUtils';
import { toast } from 'sonner';

// Schema cache with expiration for better performance
const schemaCache: Record<string, {
  schema: WorkflowFileSchema;
  timestamp: number;
  source: 'database' | 'propagation';
}> = {};

// Cache TTL in milliseconds (5 minutes)
const SCHEMA_CACHE_TTL = 5 * 60 * 1000;

export async function getFileMetadata(fileId: string): Promise<WorkflowFileSchema | null> {
  try {
    // Check cache first
    const cacheKey = `file-${fileId}`;
    const cachedSchema = schemaCache[cacheKey];
    
    if (cachedSchema && (Date.now() - cachedSchema.timestamp) < SCHEMA_CACHE_TTL) {
      console.log(`Using cached schema for file ${fileId}`);
      return cachedSchema.schema;
    }
    
    console.log(`Fetching file metadata for file ${fileId}`);
    
    // Use retry operation for more resilient fetching
    const response = await retryOperation(
      async () => {
        const { data, error } = await supabase
          .from('file_metadata')
          .select('column_definitions')
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
      
    if (!response.data?.column_definitions) {
      console.error('Error fetching file metadata or no data found');
      return null;
    }
    
    const schema = {
      columns: Object.keys(response.data.column_definitions),
      types: response.data.column_definitions as Record<string, string>
    };
    
    // Update cache
    schemaCache[cacheKey] = {
      schema,
      timestamp: Date.now(),
      source: 'database'
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
  options: { forceRefresh?: boolean } = {}
): Promise<WorkflowFileSchema | null> {
  try {
    const { forceRefresh = false } = options;
    
    // Handle temporary workflow IDs
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    // Generate cache key
    const cacheKey = `node-${dbWorkflowId}-${nodeId}`;
    
    // Check cache first unless force refresh is requested
    if (!forceRefresh && schemaCache[cacheKey] && (Date.now() - schemaCache[cacheKey].timestamp) < SCHEMA_CACHE_TTL) {
      console.log(`Using cached schema for node ${nodeId}`);
      return schemaCache[cacheKey].schema;
    }
    
    console.log(`Fetching schema for node ${nodeId} in workflow ${dbWorkflowId}`);
    
    const response = await retryOperation(
      async () => {
        const { data, error } = await supabase
          .from('workflow_file_schemas')
          .select('columns, data_types, file_id')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', nodeId)
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
      console.log(`No schema found for node ${nodeId}`);
      return null;
    }
    
    // Validate schema structure
    if (!Array.isArray(response.data.columns) || !response.data.data_types) {
      console.warn(`Invalid schema structure for node ${nodeId}:`, response.data);
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
      source: 'database'
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
  schema: WorkflowFileSchema
): Promise<boolean> {
  try {
    console.log(`Updating schema for node ${nodeId} in workflow ${workflowId}`);
    console.log('Schema data:', schema);
    
    const result = await retryOperation(
      async () => {
        const { error } = await supabase
          .from('workflow_file_schemas')
          .upsert({
            workflow_id: workflowId,
            node_id: nodeId,
            file_id: fileId,
            columns: schema.columns,
            data_types: schema.types,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'workflow_id,node_id'
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
    const cacheKey = `node-${workflowId}-${nodeId}`;
    schemaCache[cacheKey] = {
      schema,
      timestamp: Date.now(),
      source: 'database'
    };
    
    console.log(`Schema updated successfully for node ${nodeId}`);
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
  schema: SchemaColumn[]
): Promise<boolean> {
  try {
    console.log(`Propagating schema from ${sourceNodeId} to ${targetNodeId}`);
    
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
            columns,
            data_types: dataTypes,
            is_temporary: false,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'workflow_id,node_id'
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
    const cacheKey = `node-${workflowId}-${targetNodeId}`;
    schemaCache[cacheKey] = {
      schema: { columns, types: dataTypes },
      timestamp: Date.now(),
      source: 'propagation'
    };
    
    console.log(`Schema propagated successfully to ${targetNodeId}`);
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
  targetNodeId: string
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
    
    // Now get the schema from the source node
    return await getNodeSchema(workflowId, sourceNodeId);
  } catch (error) {
    console.error('Error getting source node schema:', error);
    return null;
  }
}

/**
 * Clear the schema cache for specific nodes or the entire cache
 */
export function clearSchemaCache(options?: { 
  workflowId?: string; 
  nodeId?: string;
  fileId?: string;
}) {
  if (!options) {
    // Clear entire cache
    Object.keys(schemaCache).forEach(key => delete schemaCache[key]);
    console.log('Cleared entire schema cache');
    return;
  }
  
  const { workflowId, nodeId, fileId } = options;
  
  // Handle temporary workflow IDs
  const dbWorkflowId = workflowId?.startsWith('temp-') ? workflowId.substring(5) : workflowId;
  
  Object.keys(schemaCache).forEach(key => {
    if (
      (dbWorkflowId && key.includes(`-${dbWorkflowId}-`)) ||
      (nodeId && key.endsWith(`-${nodeId}`)) ||
      (fileId && key === `file-${fileId}`)
    ) {
      delete schemaCache[key];
      console.log(`Cleared cache for key: ${key}`);
    }
  });
}
