
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { getNodeSchema, convertToSchemaColumns, clearSchemaCache } from '@/utils/fileSchemaUtils';
import { toast } from 'sonner';
import { retryOperation } from '@/utils/retryUtils';

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
  sheetName?: string
): Promise<boolean> {
  try {
    console.log(`Direct schema propagation: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'not specified'}`);
    
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
      
    // Get the source node's file and metadata to determine the sheet
    const { data: sourceNodeFile, error: sourceNodeError } = await supabase
      .from('workflow_files')
      .select('metadata, file_id, processing_status')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (sourceNodeError) {
      console.error('Error fetching source node metadata:', sourceNodeError);
      return false;
    }
    
    if (sourceNodeFile?.processing_status && sourceNodeFile.processing_status !== 'completed') {
      console.log(`Source file for node ${sourceNodeId} is still processing (${sourceNodeFile.processing_status}), will retry later`);
      return false;
    }
    
    const metadata = sourceNodeFile?.metadata as { selected_sheet?: string } | null;
    
    // Determine the effective sheet name to use
    // Priority: 1. Explicitly provided sheetName, 2. Selected sheet in metadata, 3. Default 'Sheet1'
    const effectiveSheetName = sheetName || metadata?.selected_sheet || 'Sheet1';
    
    console.log(`Using effective sheet name: ${effectiveSheetName}`);
    
    const result = await retryOperation(
      async () => {
        // Clear cache for the source node to ensure fresh schema
        clearSchemaCache({ workflowId: dbWorkflowId, nodeId: sourceNodeId, sheetName: effectiveSheetName });
        
        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Schema fetch timed out for source node ${sourceNodeId}, sheet ${effectiveSheetName}`));
          }, 5000);
        });
        
        try {
          // Fetch the source schema for the specific sheet
          const response = await Promise.race([
            supabase
              .from('workflow_file_schemas')
              .select('columns, data_types, file_id, sample_data, total_rows, has_headers')
              .eq('workflow_id', dbWorkflowId)
              .eq('node_id', sourceNodeId)
              .eq('sheet_name', effectiveSheetName)
              .maybeSingle(),
            timeoutPromise
          ]);
          
          clearTimeout(timeoutId);
          
          if (typeof response === 'boolean') {
            return false;
          }
          
          const { data, error } = response as any;
          
          if (error) {
            console.error('Error fetching source schema:', error);
            return false;
          }
          
          if (!data || !data.columns) {
            console.log(`No schema found for source node ${sourceNodeId}, sheet ${effectiveSheetName}`);
            return false;
          }
          
          console.log(`Found schema for source node ${sourceNodeId}, sheet ${effectiveSheetName}:`, data.columns.slice(0, 5));
          
          // Get target node's file info (if it exists)
          const { data: existingFile, error: fetchError } = await supabase
            .from('workflow_files')
            .select('file_id, metadata')
            .eq('workflow_id', dbWorkflowId)
            .eq('node_id', targetNodeId)
            .maybeSingle();
            
          if (fetchError) {
            console.warn('Could not fetch target node file record:', fetchError);
            // Non-critical error, don't fail the operation
          }
          
          // Determine file ID to use - use source file ID if target doesn't have one
          let fileId = existingFile?.file_id;
          if (!fileId && sourceNodeFile?.file_id) {
            fileId = sourceNodeFile.file_id;
            console.log(`Using source node's file ID: ${fileId}`);
          } else if (!fileId) {
            // Create a placeholder for DB needs
            fileId = '00000000-0000-0000-0000-000000000000';
            console.log(`No file ID available, using placeholder UUID`);
          }
          
          console.log(`Using file ID ${fileId} for schema propagation, sheet ${effectiveSheetName}`);
          
          // Update the target schema with the source schema for the specific sheet using parameters
          // to prevent SQL injection and UUID format errors
          const targetResponse = await supabase
            .from('workflow_file_schemas')
            .upsert({
              workflow_id: dbWorkflowId,
              node_id: targetNodeId,
              file_id: fileId,
              sheet_name: effectiveSheetName,
              columns: data.columns,
              data_types: data.data_types,
              sample_data: data.sample_data || [],
              total_rows: data.total_rows || 0,
              has_headers: data.has_headers !== undefined ? data.has_headers : true,
              is_temporary: workflowId.startsWith('temp-'),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'workflow_id,node_id,sheet_name'
            });
            
          if (targetResponse.error) {
            console.error('Error propagating schema to target node:', targetResponse.error);
            return false;
          }
          
          // Clear cache for the target node to ensure it uses the new schema
          clearSchemaCache({ 
            workflowId: dbWorkflowId, 
            nodeId: targetNodeId,
            sheetName: effectiveSheetName 
          });
          
          // Also update the target node's metadata to include the selected sheet
          // This ensures the target node "knows" which sheet to use
          const targetMetadata = existingFile?.metadata || {};
          // Fix the spread type error by casting to a valid object type
          const updatedMetadata = {
            ...(targetMetadata as Record<string, any>),
            selected_sheet: effectiveSheetName
          };
          
          const { error: updateError } = await supabase
            .from('workflow_files')
            .upsert({
              workflow_id: dbWorkflowId,
              node_id: targetNodeId,
              file_id: fileId,
              metadata: updatedMetadata
            }, {
              onConflict: 'workflow_id,node_id'
            });
            
          if (updateError) {
            console.warn('Could not update target node selected sheet:', updateError);
            // Non-critical error, don't fail the operation
          }
          
          console.log(`Successfully propagated schema from ${sourceNodeId} to ${targetNodeId}, sheet ${effectiveSheetName}`);
          return true;
        } catch (error) {
          clearTimeout(timeoutId);
          console.error('Error in schema propagation:', error);
          throw error;
        }
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

export function convertSchemaColumnsToDbFormat(schema: SchemaColumn[]) {
  const columns = schema.map(col => col.name);
  const dataTypes = schema.reduce((acc, col) => {
    acc[col.name] = col.type;
    return acc;
  }, {} as Record<string, string>);
  
  return { columns, dataTypes };
}

export function convertDbSchemaToColumns(
  columns: string[], 
  dataTypes: Record<string, string>
): SchemaColumn[] {
  return columns.map(column => ({
    name: column,
    type: dataTypes[column] as 'string' | 'text' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown'
  }));
}

export async function forceSchemaRefresh(
  workflowId: string,
  nodeId: string,
  sheetName: string = 'Sheet1'
): Promise<SchemaColumn[] | null> {
  clearSchemaCache({ workflowId, nodeId, sheetName });
  
  console.log(`Forcing schema refresh for node ${nodeId}, sheet ${sheetName}`);
  
  const schema = await getNodeSchema(workflowId, nodeId, { 
    forceRefresh: true,
    sheetName 
  });
  
  if (!schema) {
    return null;
  }
  
  return convertToSchemaColumns(schema);
}

export async function checkSchemaPropagationNeeded(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    // Get the source node's metadata to determine the effective sheet name
    const { data: sourceNodeFile } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', workflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    const metadata = sourceNodeFile?.metadata as FileMetadata | null;
    const sourceSheetName = sheetName || metadata?.selected_sheet || 'Sheet1';
    
    // Fetch schema for both source and target nodes with the same sheet name
    const sourceSchema = await getNodeSchema(workflowId, sourceNodeId, { sheetName: sourceSheetName });
    const targetSchema = await getNodeSchema(workflowId, targetNodeId, { sheetName: sourceSheetName });
    
    if (!sourceSchema) {
      console.log(`No source schema available for ${sourceNodeId}, sheet ${sourceSheetName}`);
      return false;
    }
    
    if (!targetSchema) {
      console.log(`No target schema available for ${targetNodeId}, propagation needed`);
      return true;
    }
    
    // Compare schemas to see if propagation is needed
    const sourceColumns = sourceSchema.columns.sort().join(',');
    const targetColumns = targetSchema.columns.sort().join(',');
    
    const propagationNeeded = sourceColumns !== targetColumns;
    console.log(`Schema propagation needed for sheet ${sourceSheetName}: ${propagationNeeded}`);
    
    return propagationNeeded;
  } catch (error) {
    console.error('Error checking if schema propagation is needed:', error);
    return true; // Default to needing propagation on error to be safe
  }
}

export async function isNodeReadyForSchemaPropagation(
  workflowId: string,
  nodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
      
    // Get node's file and metadata
    const { data: nodeFile } = await supabase
      .from('workflow_files')
      .select('file_id, processing_status, metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (!nodeFile?.file_id) {
      console.log(`Node ${nodeId} has no associated file`);
      return false;
    }
    
    if (nodeFile.processing_status !== 'completed') {
      console.log(`Node ${nodeId} has a file that is not yet processed (status: ${nodeFile.processing_status})`);
      return false;
    }
    
    // Check if file is fully processed
    const { data: fileData } = await supabase
      .from('excel_files')
      .select('processing_status')
      .eq('id', nodeFile.file_id)
      .maybeSingle();
      
    if (fileData?.processing_status !== 'completed') {
      console.log(`File for node ${nodeId} is not fully processed (status: ${fileData?.processing_status})`);
      return false;
    }
    
    // Determine which sheet to check
    const metadata = nodeFile.metadata as FileMetadata | null;
    const effectiveSheetName = sheetName || metadata?.selected_sheet || 'Sheet1';
    
    // Check if schema exists for this sheet
    const { data: schemaData } = await supabase
      .from('workflow_file_schemas')
      .select('columns')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .eq('sheet_name', effectiveSheetName)
      .maybeSingle();
      
    if (!schemaData || !schemaData.columns || schemaData.columns.length === 0) {
      console.log(`No schema available for node ${nodeId}, sheet ${effectiveSheetName}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking readiness for node ${nodeId}:`, error);
    return false;
  }
}

/**
 * Get the currently selected sheet for a node
 */
export async function getNodeSelectedSheet(
  workflowId: string,
  nodeId: string
): Promise<string | null> {
  try {
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
      
    const { data: nodeFile } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (!nodeFile) {
      return null;
    }
    
    const metadata = nodeFile.metadata as FileMetadata | null;
    return metadata?.selected_sheet || null;
  } catch (error) {
    console.error(`Error getting selected sheet for node ${nodeId}:`, error);
    return null;
  }
}

/**
 * Synchronize schema and selected sheet between nodes
 */
export async function synchronizeNodesSheetSelection(
  workflowId: string, 
  sourceNodeId: string, 
  targetNodeId: string
): Promise<boolean> {
  try {
    const sourceSheet = await getNodeSelectedSheet(workflowId, sourceNodeId);
    
    if (!sourceSheet) {
      console.log(`Source node ${sourceNodeId} has no selected sheet`);
      return false;
    }
    
    // Update target node's selected sheet
    const dbWorkflowId = workflowId.startsWith('temp-')
      ? workflowId.substring(5)
      : workflowId;
      
    const { data: targetFile } = await supabase
      .from('workflow_files')
      .select('metadata, file_id')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
      
    if (!targetFile) {
      console.log(`Target node ${targetNodeId} not found`);
      return false;
    }
    
    const metadata = targetFile.metadata as FileMetadata | null || {};
    const updatedMetadata = {
      ...(metadata as Record<string, any>),
      selected_sheet: sourceSheet
    };
    
    const { error } = await supabase
      .from('workflow_files')
      .update({ metadata: updatedMetadata })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId);
      
    if (error) {
      console.error(`Error updating target node ${targetNodeId} sheet selection:`, error);
      return false;
    }
    
    // Propagate schema with this sheet
    return await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sourceSheet);
  } catch (error) {
    console.error('Error synchronizing nodes sheet selection:', error);
    return false;
  }
}
