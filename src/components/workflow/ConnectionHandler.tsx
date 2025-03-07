
import { useEffect, useCallback } from 'react';
import { useReactFlow, Connection, Edge } from '@xyflow/react';
import { useWorkflow } from './context/WorkflowContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/types/workflow';

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
        // Need to convert each edge to a format that matches the table schema
        // and ensures metadata is JSON-serializable
        const edgesData = edges.map(edge => {
          // Create a safe metadata object by stringifying and parsing the edge properties
          // This handles React elements and complex objects
          const safeMetadata: Record<string, Json> = {
            sourceHandle: edge.sourceHandle as Json,
            targetHandle: edge.targetHandle as Json,
            animated: (edge.animated || false) as Json,
            // Omit label, style, and data if they might contain non-serializable content
            // or convert them safely if needed
          };
          
          if (edge.label && typeof edge.label === 'string') {
            safeMetadata.label = edge.label as Json;
          }
          
          // Only include data if it's a simple object
          if (edge.data && typeof edge.data === 'object') {
            try {
              // Test if it's serializable
              JSON.stringify(edge.data);
              safeMetadata.data = edge.data as Json;
            } catch (e) {
              // Skip this property if it can't be serialized
              console.warn('Edge data could not be serialized:', e);
            }
          }
          
          return {
            workflow_id: workflowId,
            source_node_id: edge.source,
            target_node_id: edge.target,
            edge_id: edge.id,
            edge_type: edge.type || 'default',
            metadata: safeMetadata
          };
        });
        
        // Insert edges in batches to avoid any potential size limits
        for (let i = 0; i < edgesData.length; i += 50) {
          const batch = edgesData.slice(i, i + 50);
          const { error } = await supabase
            .from('workflow_edges')
            .insert(batch);
            
          if (error) {
            console.error('Error saving edges batch:', error);
          }
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
    
    // Set up manual event handling for edge changes
    // Since reactFlowInstance.on() doesn't exist, we use useEffect with dependencies
    
    // Initial save of edges
    handleEdgeChanges();
    
    // Return cleanup function
    return () => {
      // No cleanup needed since we're not using a subscription
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
