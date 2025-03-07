
import { useEffect, useCallback } from 'react';
import { useReactFlow, Connection, Edge } from '@xyflow/react';
import { useWorkflow } from './context/WorkflowContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ConnectionHandlerProps {
  workflowId?: string;
}

const ConnectionHandler: React.FC<ConnectionHandlerProps> = ({ workflowId }) => {
  const reactFlowInstance = useReactFlow();
  const { propagateFileSchema } = useWorkflow();

  // Save edges to the database
  const saveEdgesToDatabase = useCallback(async (edges: Edge[]) => {
    if (!workflowId) return;
    
    try {
      // First, remove existing edges for this workflow to avoid duplicates
      await supabase
        .from('workflow_edges')
        .delete()
        .eq('workflow_id', workflowId);
      
      // Then insert all current edges
      if (edges.length > 0) {
        const edgesData = edges.map(edge => ({
          workflow_id: workflowId,
          source_node_id: edge.source,
          target_node_id: edge.target,
          edge_id: edge.id,
          edge_type: edge.type || 'default',
          metadata: {
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            label: edge.label,
            animated: edge.animated,
            style: edge.style,
            data: edge.data
          }
        }));
        
        const { error } = await supabase
          .from('workflow_edges')
          .insert(edgesData);
          
        if (error) {
          console.error('Error saving edges:', error);
        }
      }
    } catch (error) {
      console.error('Error in saveEdgesToDatabase:', error);
    }
  }, [workflowId]);

  // Handle edge changes
  useEffect(() => {
    if (!workflowId) return;
    
    const handleEdgeChanges = () => {
      const currentEdges = reactFlowInstance.getEdges();
      saveEdgesToDatabase(currentEdges);
    };
    
    // Subscribe to edge changes
    const unsubscribe = reactFlowInstance.on('edgesChange', handleEdgeChanges);
    
    // Initial save of edges
    handleEdgeChanges();
    
    return () => {
      unsubscribe();
    };
  }, [reactFlowInstance, workflowId, saveEdgesToDatabase]);

  // Handle data propagation when connections change
  useEffect(() => {
    if (!workflowId) return;
    
    // Process all edges to propagate file schemas
    const handleEdges = async () => {
      // Get edges from the reactFlowInstance state using getEdges method
      const currentEdges = reactFlowInstance.getEdges();
      
      for (const edge of currentEdges) {
        // Propagate file schema from source to target
        await propagateFileSchema(edge.source, edge.target);
      }
    };
    
    handleEdges();
  }, [reactFlowInstance, workflowId, propagateFileSchema]);

  // No rendering needed, this is a utility component
  return null;
};

export default ConnectionHandler;
