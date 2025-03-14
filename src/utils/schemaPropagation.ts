
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { getNodeSchema, convertToSchemaColumns, clearSchemaCache, getNodeSelectedSheet, findSourceNodes } from '@/utils/fileSchemaUtils';
import { toast } from 'sonner';
import { retryOperation } from '@/utils/retryUtils';

// Type definition for metadata
interface FileMetadata {
  selected_sheet?: string;
  sheets?: Array<{
    name: string;
    index: number;
    row_count?: number;
    rowCount?: number;
    is_default?: boolean;
    isDefault?: boolean;
  }>;
  [key: string]: any;
}

/**
 * Directly propagate schema from source node to target node
 * This ensures immediate propagation when an edge is created
 */
export async function propagateSchemaDirectly(
  workflowId: string,
  sourceNodeId: string, 
  targetNodeId: string,
  sheetName: string = 'Sheet1'
): Promise<boolean> {
  try {
    console.log(`Direct schema propagation: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName}`);
    
    // Check for temporary workflow ID and convert if needed
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
    
    // 1. First, get the selected sheet from the source node
    const { data: sourceNodeFile, error: sourceNodeError } = await supabase
      .from('workflow_files')
      .select('metadata, file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (sourceNodeError) {
      console.error('Error fetching source node metadata:', sourceNodeError);
      // Continue anyway, using the provided sheet name
    }
    
    // Use the provided sheet name or get it from the source node's metadata
    const metadata = sourceNodeFile?.metadata as FileMetadata | null;
    const effectiveSheetName = metadata?.selected_sheet || sheetName;
    const fileId = sourceNodeFile?.file_id;
    
    console.log(`Using effective sheet name: ${effectiveSheetName}`);
    
    // 2. Get the schema from the source node with retries
    const result = await retryOperation(
      async () => {
        // Clear cache for more reliable fetching in this critical operation
        clearSchemaCache({ workflowId: dbWorkflowId, nodeId: sourceNodeId, sheetName: effectiveSheetName });
        
        const response = await supabase
          .from('workflow_file_schemas')
          .select('columns, data_types, file_id, sample_data, total_rows, has_headers')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', sourceNodeId)
          .eq('sheet_name', effectiveSheetName)
          .maybeSingle();
          
        if (response.error) {
          console.error('Error fetching source schema:', response.error);
          return false;
        }
        
        if (!response.data || !response.data.columns) {
          console.log(`No schema found for source node ${sourceNodeId}, sheet ${effectiveSheetName}`);
          
          // Try without the sheet name as fallback
          const fallbackResponse = await supabase
            .from('workflow_file_schemas')
            .select('columns, data_types, file_id, sample_data, total_rows, has_headers')
            .eq('workflow_id', dbWorkflowId)
            .eq('node_id', sourceNodeId)
            .maybeSingle();
            
          if (fallbackResponse.error || !fallbackResponse.data || !fallbackResponse.data.columns) {
            console.log(`No fallback schema found for source node ${sourceNodeId}`);
            return false;
          }
          
          console.log(`Using fallback schema for source node ${sourceNodeId}`);
          response.data = fallbackResponse.data;
        }
        
        // 3. Now propagate to the target node
        const targetResponse = await supabase
          .from('workflow_file_schemas')
          .upsert({
            workflow_id: dbWorkflowId,
            node_id: targetNodeId,
            file_id: response.data.file_id || fileId || '00000000-0000-0000-0000-000000000000',
            sheet_name: effectiveSheetName,
            columns: response.data.columns,
            data_types: response.data.data_types,
            sample_data: response.data.sample_data || [],
            total_rows: response.data.total_rows || 0,
            has_headers: response.data.has_headers !== undefined ? response.data.has_headers : true,
            is_temporary: workflowId.startsWith('temp-'),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'workflow_id,node_id,sheet_name'
          });
          
        if (targetResponse.error) {
          console.error('Error propagating schema to target node:', targetResponse.error);
          return false;
        }
        
        // Clear the target node's cache to ensure fresh data
        clearSchemaCache({ 
          workflowId: dbWorkflowId, 
          nodeId: targetNodeId,
          sheetName: effectiveSheetName 
        });
        
        // Update the selected sheet in the target node's metadata
        try {
          // First check if there's an existing record
          const { data: existingData } = await supabase
            .from('workflow_files')
            .select('metadata')
            .eq('workflow_id', dbWorkflowId)
            .eq('node_id', targetNodeId)
            .maybeSingle();
            
          const existingMetadata = existingData?.metadata || {};
          
          const updatedMetadata = {
            ...existingMetadata,
            selected_sheet: effectiveSheetName
          };
            
          const { error: updateError } = await supabase
            .from('workflow_files')
            .upsert({
              workflow_id: dbWorkflowId,
              node_id: targetNodeId,
              metadata: updatedMetadata,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'workflow_id,node_id'
            });
            
          if (updateError) {
            console.warn('Could not update target node selected sheet:', updateError);
            // Non-critical error, don't fail the operation
          }
        } catch (error) {
          console.warn('Error updating target node metadata:', error);
          // Non-critical error, don't fail the operation
        }
        
        console.log(`Successfully propagated schema from ${sourceNodeId} to ${targetNodeId}, sheet ${effectiveSheetName}`);
        return true;
      },
      {
        maxRetries: 3,
        delay: 500,
        onRetry: (err, attempt) => {
          console.log(`Retrying schema propagation (${attempt}/3): ${err.message}`);
        }
      }
    );
    
    return result;
  } catch (error) {
    console.error('Error in direct schema propagation:', error);
    return false;
  }
}

/**
 * Convert schema columns to the format needed for workflow_file_schemas
 */
export function convertSchemaColumnsToDbFormat(schema: SchemaColumn[]) {
  const columns = schema.map(col => col.name);
  const dataTypes = schema.reduce((acc, col) => {
    acc[col.name] = col.type;
    return acc;
  }, {} as Record<string, string>);
  
  return { columns, dataTypes };
}

/**
 * Convert database schema format to SchemaColumn[]
 */
export function convertDbSchemaToColumns(
  columns: string[], 
  dataTypes: Record<string, string>
): SchemaColumn[] {
  return columns.map(column => ({
    name: column,
    type: dataTypes[column] as 'string' | 'text' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown'
  }));
}

/**
 * Force schema refresh for a node by clearing cache and refetching from database
 */
export async function forceSchemaRefresh(
  workflowId: string,
  nodeId: string,
  sheetName: string = 'Sheet1'
): Promise<SchemaColumn[] | null> {
  // Clear cache first
  clearSchemaCache({ workflowId, nodeId, sheetName });
  
  console.log(`Forcing schema refresh for node ${nodeId}, sheet ${sheetName}`);
  
  // Get fresh schema
  const schema = await getNodeSchema(workflowId, nodeId, { 
    forceRefresh: true,
    sheetName 
  });
  
  if (!schema) {
    return null;
  }
  
  return convertToSchemaColumns(schema);
}

/**
 * Check if schema propagation is needed
 */
export async function checkSchemaPropagationNeeded(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName: string = 'Sheet1'
): Promise<boolean> {
  // Get source node's selected sheet if available
  const sourceSheetName = await getNodeSelectedSheet(workflowId, sourceNodeId) || sheetName;
  
  const sourceSchema = await getNodeSchema(workflowId, sourceNodeId, { sheetName: sourceSheetName });
  const targetSchema = await getNodeSchema(workflowId, targetNodeId, { sheetName: sourceSheetName });
  
  if (!sourceSchema) {
    console.log(`No source schema available for ${sourceNodeId}, sheet ${sourceSheetName}`);
    return false; // Nothing to propagate
  }
  
  if (!targetSchema) {
    console.log(`No target schema found for ${targetNodeId}, propagation needed`);
    return true; // Target needs schema
  }
  
  // Compare schemas - if they're different, propagation is needed
  const sourceColumns = sourceSchema.columns.sort().join(',');
  const targetColumns = targetSchema.columns.sort().join(',');
  
  const needsPropagation = sourceColumns !== targetColumns;
  console.log(`Schema comparison for ${sourceNodeId} -> ${targetNodeId}: ${needsPropagation ? 'Different' : 'Same'}`);
  
  return needsPropagation;
}

/**
 * Setup real-time subscription for schema changes
 */
export function subscribeToSchemaChanges(
  workflowId: string,
  nodeId: string,
  sheetName: string,
  onSchemaChange: () => void
) {
  // Check for temporary workflow ID and convert if needed
  const dbWorkflowId = workflowId.startsWith('temp-')
    ? workflowId.substring(5)
    : workflowId;
  
  console.log(`Setting up real-time subscription for schema changes on node ${nodeId}, sheet ${sheetName}`);
  
  const channel = supabase
    .channel(`schema_changes_${nodeId}_${sheetName}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'workflow_file_schemas',
        filter: `workflow_id=eq.${dbWorkflowId} AND node_id=eq.${nodeId} AND sheet_name=eq.${sheetName}`
      },
      (payload) => {
        console.log(`Received schema update for ${nodeId}, sheet ${sheetName}:`, payload);
        onSchemaChange();
      }
    )
    .subscribe((status) => {
      console.log(`Schema subscription status for ${nodeId}, sheet ${sheetName}: ${status}`);
    });
    
  return channel;
}

/**
 * Propagate schema from all source nodes to the target node
 */
export async function propagateSchemaFromSources(
  workflowId: string,
  targetNodeId: string
): Promise<boolean> {
  try {
    const sourceNodes = await findSourceNodes(workflowId, targetNodeId);
    
    if (sourceNodes.length === 0) {
      console.log(`No source nodes found for ${targetNodeId}`);
      return false;
    }
    
    // Try each source node until one succeeds
    for (const sourceNodeId of sourceNodes) {
      const sourceSheetName = await getNodeSelectedSheet(workflowId, sourceNodeId);
      
      if (!sourceSheetName) {
        console.log(`No sheet selected for source node ${sourceNodeId}`);
        continue;
      }
      
      console.log(`Attempting to propagate schema from ${sourceNodeId} with sheet ${sourceSheetName}`);
      const result = await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sourceSheetName);
      
      if (result) {
        console.log(`Successfully propagated schema from ${sourceNodeId} to ${targetNodeId}`);
        return true;
      }
    }
    
    console.log(`Failed to propagate schema from any source node to ${targetNodeId}`);
    return false;
  } catch (error) {
    console.error(`Error propagating schema from sources to ${targetNodeId}:`, error);
    return false;
  }
}
