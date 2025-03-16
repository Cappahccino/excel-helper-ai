
import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';

export const useSheetSelection = (workflowId: string | null, nodeId: string) => {
  const handleSheetSelection = useCallback(async (
    sheetName: string, 
    config: any, 
    onChange?: (nodeId: string, config: any) => void
  ) => {
    console.log(`Setting selected sheet to: ${sheetName}`);
    
    if (!workflowId) {
      console.warn('No workflow ID available, sheet selection will not persist');
      return;
    }
    
    if (onChange) {
      onChange(nodeId, {
        ...config,
        selectedSheet: sheetName
      });
    }
    
    try {
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      const { data: currentFile } = await supabase
        .from('workflow_files')
        .select('metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId)
        .maybeSingle();
      
      const currentMetadata = (currentFile?.metadata as Record<string, any>) || {};
      
      const { error } = await supabase
        .from('workflow_files')
        .update({
          metadata: {
            ...currentMetadata,
            selected_sheet: sheetName
          }
        })
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', nodeId);
        
      if (error) {
        console.error('Error updating selected sheet in metadata:', error);
        toast.error('Failed to update selected sheet');
      } else {
        console.log(`Successfully updated selected sheet to ${sheetName} in metadata`);
        toast.success(`Sheet "${sheetName}" selected`);
      }
      
      const { data: edges } = await supabase
        .from('workflow_edges')
        .select('target_node_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('source_node_id', nodeId);
        
      if (edges && edges.length > 0) {
        console.log(`Found ${edges.length} connected nodes to update with new sheet selection`);
        
        for (const edge of edges) {
          const targetNodeId = edge.target_node_id;
          console.log(`Propagating schema to ${targetNodeId} with sheet ${sheetName}`);
          
          const success = await propagateSchemaDirectly(workflowId, nodeId, targetNodeId, sheetName);
          if (success) {
            console.log(`Successfully propagated schema to ${targetNodeId} with sheet ${sheetName}`);
          } else {
            console.error(`Failed to propagate schema to ${targetNodeId} with sheet ${sheetName}`);
          }
        }
      }
    } catch (error) {
      console.error('Error handling sheet selection:', error);
      toast.error('Failed to update sheet selection');
    }
  }, [workflowId, nodeId]);

  return {
    handleSheetSelection
  };
};
