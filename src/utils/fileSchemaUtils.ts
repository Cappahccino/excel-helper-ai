
import { supabase } from '@/integrations/supabase/client';

/**
 * Sheet metadata interface
 */
export interface SheetMetadata {
  name: string;
  rowCount?: number;
  columnCount?: number;
  isDefault?: boolean;
}

/**
 * Schema options for getting or setting schemas
 */
interface SchemaOptions {
  forceRefresh?: boolean;
  sheetName?: string;
}

/**
 * Get available sheets for a node file
 */
export async function getNodeSheets(
  workflowId: string,
  nodeId: string
): Promise<SheetMetadata[]> {
  try {
    const { data, error } = await supabase.functions.invoke('fileOperations', {
      body: {
        action: 'getSheets',
        workflowId,
        nodeId
      }
    });
    
    if (error) {
      console.error('Error getting sheets:', error);
      return [];
    }
    
    if (data?.sheets && Array.isArray(data.sheets)) {
      return data.sheets;
    }
    
    return [];
  } catch (error) {
    console.error('Error in getNodeSheets:', error);
    return [];
  }
}

/**
 * Get schema for a node file
 */
export async function getNodeSchema(
  workflowId: string,
  nodeId: string,
  options: SchemaOptions = {}
): Promise<any> {
  const {
    forceRefresh = false,
    sheetName
  } = options;
  
  try {
    const { data, error } = await supabase.functions.invoke('fileOperations', {
      body: {
        action: 'getSchema',
        workflowId,
        nodeId,
        sheetName,
        forceRefresh
      }
    });
    
    if (error) {
      console.error('Error getting schema:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getNodeSchema:', error);
    return null;
  }
}

/**
 * Get selected sheet for a node
 */
export async function getNodeSelectedSheet(
  workflowId: string,
  nodeId: string
): Promise<string | undefined> {
  try {
    const { data, error } = await supabase
      .from('workflow_files')
      .select('metadata')
      .eq('workflow_id', workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId)
      .eq('node_id', nodeId)
      .maybeSingle();
      
    if (error) {
      console.error('Error getting selected sheet:', error);
      return undefined;
    }
    
    if (data?.metadata && typeof data.metadata === 'object') {
      return (data.metadata as any).selected_sheet;
    }
    
    return undefined;
  } catch (error) {
    console.error('Error in getNodeSelectedSheet:', error);
    return undefined;
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
    const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
    
    const { error } = await supabase
      .from('workflow_files')
      .update({
        metadata: {
          selected_sheet: sheetName
        }
      })
      .eq('workflow_id', dbWorkflowId)
      .eq('node_id', nodeId);
      
    if (error) {
      console.error('Error setting selected sheet:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in setNodeSelectedSheet:', error);
    return false;
  }
}

/**
 * Trigger schema refresh for a node
 */
export async function triggerSchemaRefresh(
  workflowId: string,
  nodeId: string,
  options: {
    sheetName?: string;
    forceProcessing?: boolean;
  } = {}
): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('fileOperations', {
      body: {
        action: 'refreshSchema',
        workflowId,
        nodeId,
        sheetName: options.sheetName,
        forceProcessing: options.forceProcessing
      }
    });
    
    if (error) {
      console.error('Error triggering schema refresh:', error);
      return false;
    }
    
    return !!data?.success;
  } catch (error) {
    console.error('Error in triggerSchemaRefresh:', error);
    return false;
  }
}
