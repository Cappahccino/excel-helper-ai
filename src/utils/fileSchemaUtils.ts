
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
 * Generate a unique cache key for schema cache
 */
function generateCacheKey(workflowId: string, nodeId: string, sheetName?: string): string {
  return `${workflowId}:${nodeId}:${sheetName || 'default'}`;
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
  const cacheKey = generateCacheKey(workflowId, nodeId, sheetName);
  
  // Try cache first
  if (!forceRefresh) {
    const cached = schemaCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < maxCacheAge) {
      return cached.schema;
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
    
    // Cache the result
    schemaCache.set(cacheKey, {
      schema: data,
      timestamp: Date.now(),
      source: 'database',
      sheetName
    });
    
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
      
    if (fileData?.metadata && typeof fileData.metadata === 'object') {
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
