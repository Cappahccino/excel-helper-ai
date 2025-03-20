import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { retryOperation } from '@/utils/retryUtils';
import { 
  cacheSchema, 
  getSchemaFromCache, 
  wasRecentlyPropagated, 
  trackSuccessfulPropagation 
} from './schema';
import { standardizeSchemaColumns } from './schemaStandardization';

/**
 * Propagate schema with retry mechanism
 */
export async function propagateSchemaWithRetry(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  options: {
    maxRetries?: number;
    delay?: number;
    sheetName?: string;
  } = {}
): Promise<boolean> {
  const { maxRetries = 3, delay = 1000, sheetName } = options;
  
  return retryOperation(
    async () => {
      return await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, sheetName);
    },
    {
      maxRetries,
      delay,
      onRetry: (error, attempt) => {
        console.log(`Retry attempt ${attempt} for schema propagation: ${error.message}`);
      }
    }
  );
}

/**
 * Directly propagate schema from source to target node
 */
export async function propagateSchemaDirectly(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    console.log(`Propagating schema directly: ${sourceNodeId} -> ${targetNodeId}, sheet: ${sheetName || 'default'}`);
    
    // Check if this propagation was recently performed successfully
    if (wasRecentlyPropagated(workflowId, sourceNodeId, targetNodeId, { sheetName, maxAge: 5000 })) {
      console.log('Schema was recently propagated successfully, skipping duplicate propagation');
      return true;
    }
    
    // First check if source node has schema
    const sourceSchema = await getSchemaFromCache(workflowId, sourceNodeId, { sheetName });
    
    if (!sourceSchema || sourceSchema.length === 0) {
      console.log(`No cached schema available for source node ${sourceNodeId}`);
      
      // Try to fetch schema from database
      const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
      
      let effectiveSheetName = sheetName;
      if (!effectiveSheetName) {
        // Try to get selected sheet from file metadata
        const { data: sourceFile } = await supabase
          .from('workflow_files')
          .select('metadata')
          .eq('workflow_id', dbWorkflowId)
          .eq('node_id', sourceNodeId)
          .maybeSingle();
          
        if (sourceFile?.metadata && typeof sourceFile.metadata === 'object') {
          effectiveSheetName = (sourceFile.metadata as any).selected_sheet;
        }
      }
      
      const { data: schemaData } = await supabase
        .from('workflow_file_schemas')
        .select('columns, data_types')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceNodeId)
        .eq('sheet_name', effectiveSheetName || 'Sheet1')
        .maybeSingle();
        
      if (!schemaData || !schemaData.columns || !schemaData.data_types) {
        console.log(`No schema found in database for source node ${sourceNodeId}`);
        return false;
      }
      
      // Convert to SchemaColumn format
      const schema: SchemaColumn[] = schemaData.columns.map(column => ({
        name: column,
        type: schemaData.data_types[column] || 'unknown'
      }));
      
      // Cache the schema we found
      await cacheSchema(workflowId, sourceNodeId, schema, {
        sheetName: effectiveSheetName,
        source: 'database'
      });
      
      // Now that we have the schema, update the target
      const { error } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          workflow_id: dbWorkflowId,
          node_id: targetNodeId,
          file_id: '00000000-0000-0000-0000-000000000000', // Placeholder
          sheet_name: effectiveSheetName || 'Sheet1',
          columns: schemaData.columns,
          data_types: schemaData.data_types,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'workflow_id,node_id,sheet_name'
        });
        
      if (error) {
        console.error('Error updating schema:', error);
        return false;
      }
      
      // Also cache the target schema
      await cacheSchema(workflowId, targetNodeId, schema, {
        sheetName: effectiveSheetName,
        source: 'propagation'
      });
      
      // Track successful propagation
      trackSuccessfulPropagation(workflowId, sourceNodeId, targetNodeId, {
        sheetName: effectiveSheetName,
        schema
      });
      
      return true;
    }
    
    // If we have source schema in cache, standardize it
    const standardizedSchema = standardizeSchemaColumns(sourceSchema);
    
    // Cache schema for target node
    await cacheSchema(workflowId, targetNodeId, standardizedSchema, {
      sheetName,
      source: 'propagation'
    });
    
    // Also update database
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    const columns = standardizedSchema.map(col => col.name);
    const dataTypes = standardizedSchema.reduce((acc, col) => {
      acc[col.name] = col.type;
      return acc;
    }, {} as Record<string, string>);
    
    const { error } = await supabase
      .from('workflow_file_schemas')
      .upsert({
        workflow_id: dbWorkflowId,
        node_id: targetNodeId,
        file_id: '00000000-0000-0000-0000-000000000000', // Placeholder
        sheet_name: sheetName || 'Sheet1',
        columns,
        data_types: dataTypes,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id,sheet_name'
      });
      
    if (error) {
      console.error('Error updating schema:', error);
      return false;
    }
    
    // Track successful propagation
    trackSuccessfulPropagation(workflowId, sourceNodeId, targetNodeId, {
      sheetName,
      schema: standardizedSchema
    });
    
    console.log(`Schema propagated successfully from ${sourceNodeId} to ${targetNodeId}`);
    return true;
  } catch (error) {
    console.error('Error in propagateSchemaDirectly:', error);
    return false;
  }
}

/**
 * Synchronize sheet selection between nodes
 */
export async function synchronizeNodesSheetSelection(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string
): Promise<boolean> {
  try {
    console.log(`Synchronizing sheet selection between ${sourceNodeId} and ${targetNodeId}`);
    
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    // Get source node selected sheet
    const { data: sourceFile } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', sourceNodeId)
      .maybeSingle();
      
    if (!sourceFile?.metadata || typeof sourceFile.metadata !== 'object') {
      console.log('No metadata available for source node');
      return false;
    }
    
    const selectedSheet = (sourceFile.metadata as any).selected_sheet;
    if (!selectedSheet) {
      console.log('No selected sheet in source node metadata');
      return false;
    }
    
    // Update target node metadata
    const { data: targetFile } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId)
      .maybeSingle();
      
    let updatedMetadata;
    if (targetFile?.metadata && typeof targetFile.metadata === 'object') {
      updatedMetadata = {
        ...targetFile.metadata as object,
        selected_sheet: selectedSheet
      };
    } else {
      updatedMetadata = { selected_sheet: selectedSheet };
    }
    
    const { error } = await supabase
      .from('workflow_files')
      .update({ metadata: updatedMetadata })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', targetNodeId);
      
    if (error) {
      console.error('Error updating target metadata:', error);
      return false;
    }
    
    // Now propagate schema with the synchronized sheet
    return await propagateSchemaDirectly(workflowId, sourceNodeId, targetNodeId, selectedSheet);
  } catch (error) {
    console.error('Error in synchronizeNodesSheetSelection:', error);
    return false;
  }
}

/**
 * Check if node is ready for schema propagation
 */
export async function isNodeReadyForSchemaPropagation(
  workflowId: string,
  nodeId: string
): Promise<boolean> {
  try {
    // Check if node has schema in cache
    const schema = await getSchemaFromCache(workflowId, nodeId);
    if (schema && schema.length > 0) {
      return true;
    }
    
    // Check if node has file association with completed processing
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    const { data: fileData } = await supabase
      .from('workflow_files')
      .select('processing_status')
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    return fileData?.processing_status === 'completed';
  } catch (error) {
    console.error('Error in isNodeReadyForSchemaPropagation:', error);
    return false;
  }
}

/**
 * Check if schema propagation is needed
 */
export async function checkSchemaPropagationNeeded(
  workflowId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sheetName?: string
): Promise<boolean> {
  try {
    // Check if recently propagated
    if (wasRecentlyPropagated(workflowId, sourceNodeId, targetNodeId, { 
      sheetName, 
      maxAge: 60000 // 1 minute
    })) {
      return false;
    }
    
    // Get source and target schemas
    const sourceSchema = await getSchemaFromCache(workflowId, sourceNodeId, { sheetName });
    const targetSchema = await getSchemaFromCache(workflowId, targetNodeId, { sheetName });
    
    // If source has schema but target doesn't, propagation is needed
    if (sourceSchema && sourceSchema.length > 0 && (!targetSchema || targetSchema.length === 0)) {
      return true;
    }
    
    // If both have schema, check if they match
    if (sourceSchema && targetSchema) {
      // Simple check: compare column count and names
      if (sourceSchema.length !== targetSchema.length) {
        return true;
      }
      
      // Check if all source columns exist in target
      const sourceColumnNames = new Set(sourceSchema.map(col => col.name));
      const targetColumnNames = new Set(targetSchema.map(col => col.name));
      
      // Check if all source columns exist in target
      for (const name of sourceColumnNames) {
        if (!targetColumnNames.has(name)) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error in checkSchemaPropagationNeeded:', error);
    return false;
  }
}

/**
 * Get schema suitable for filtering operations
 */
export function validateSchemaForFiltering(schema: SchemaColumn[]): SchemaColumn[] {
  if (!schema || !Array.isArray(schema)) {
    return [];
  }
  
  // Filter out incompatible columns and standardize types
  return schema.filter(col => {
    // Keep only columns with valid names
    return col.name && typeof col.name === 'string' && col.name.trim().length > 0;
  }).map(col => ({
    name: col.name,
    type: standardizeType(col.type)
  }));
}

/**
 * Get schema for filtering UI
 */
export function getSchemaForFiltering(schema: SchemaColumn[]): SchemaColumn[] {
  return validateSchemaForFiltering(schema);
}

/**
 * Standardize column type for filtering operations
 */
function standardizeType(type: string): SchemaColumn['type'] {
  const lowerType = typeof type === 'string' ? type.toLowerCase() : 'unknown';
  
  // Map to standard types
  if (['number', 'numeric', 'integer', 'float', 'double', 'decimal'].includes(lowerType)) {
    return 'number';
  }
  
  if (['text', 'string', 'varchar', 'char'].includes(lowerType)) {
    return 'string';
  }
  
  if (['date', 'datetime', 'timestamp'].includes(lowerType)) {
    return 'date';
  }
  
  if (['boolean', 'bool'].includes(lowerType)) {
    return 'boolean';
  }
  
  if (['array', 'json'].includes(lowerType)) {
    return 'array';
  }
  
  if (['object'].includes(lowerType)) {
    return 'object';
  }
  
  return 'unknown';
}
