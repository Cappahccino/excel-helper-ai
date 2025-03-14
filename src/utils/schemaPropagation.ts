
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { getNodeSchema, convertToSchemaColumns, clearSchemaCache } from '@/utils/fileSchemaUtils';
import { toast } from 'sonner';
import { retryOperation } from '@/utils/retryUtils';

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
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    // Use the provided sheet name or get it from the source node's metadata
    const effectiveSheetName = sourceNodeFile?.metadata?.selected_sheet || sheetName;
    
    // 2. Get the schema from the source node with retries
    const result = await retryOperation(
      async () => {
        // Clear cache for more reliable fetching in this critical operation
        clearSchemaCache({ workflowId: dbWorkflowId, nodeId: sourceNodeId, sheetName: effectiveSheetName });
        
        const response = await supabase
          .from('workflow_file_schemas')
          .select('columns, data_types, file_id')
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
          return false;
        }
        
        // 3. Now propagate to the target node
        const targetResponse = await supabase
          .from('workflow_file_schemas')
          .upsert({
            workflow_id: dbWorkflowId,
            node_id: targetNodeId,
            file_id: response.data.file_id || '00000000-0000-0000-0000-000000000000',
            sheet_name: effectiveSheetName,
            columns: response.data.columns,
            data_types: response.data.data_types,
            updated_at: new Date().toISOString(),
            is_temporary: false
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
  const { data: sourceNodeFile } = await supabase
    .from('workflow_files')
    .select('metadata')
    .eq('workflow_id', workflowId)
    .eq('node_id', sourceNodeId)
    .maybeSingle();
    
  const sourceSheetName = sourceNodeFile?.metadata?.selected_sheet || sheetName;
  
  const sourceSchema = await getNodeSchema(workflowId, sourceNodeId, { sheetName: sourceSheetName });
  const targetSchema = await getNodeSchema(workflowId, targetNodeId, { sheetName: sourceSheetName });
  
  if (!sourceSchema) {
    return false; // Nothing to propagate
  }
  
  if (!targetSchema) {
    return true; // Target needs schema
  }
  
  // Compare schemas - if they're different, propagation is needed
  const sourceColumns = sourceSchema.columns.sort().join(',');
  const targetColumns = targetSchema.columns.sort().join(',');
  
  return sourceColumns !== targetColumns;
}
