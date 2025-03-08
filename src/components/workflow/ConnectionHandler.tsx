
import { useEffect, useCallback, useState } from 'react';
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
  const { propagateFileSchema, isTemporaryId } = useWorkflow();
  const { convertToDbWorkflowId } = useWorkflow();
  const [retryMap, setRetryMap] = useState<Record<string, { attempts: number, maxAttempts: number }>>({});

  // Save edges to the database
  const saveEdgesToDatabase = useCallback(async (edges: Edge[]) => {
    if (!workflowId) return;
    
    try {
      // Only attempt database operations if we have a workflow ID
      console.log(`Saving edges for workflow ${workflowId}, isTemporary: ${isTemporaryId}`);
      
      // Convert temporary ID to UUID for database operations if needed
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      // First, remove existing edges for this workflow to avoid duplicates
      await supabase
        .from('workflow_edges')
        .delete()
        .eq('workflow_id', dbWorkflowId);
      
      // Then insert all current edges
      if (edges.length > 0) {
        // Need to convert each edge to a format that matches the table schema
        const edgesData = edges.map(edge => {
          // Create a safe metadata object by stringifying and parsing the edge properties
          const safeMetadata: Record<string, Json> = {
            sourceHandle: edge.sourceHandle as Json,
            targetHandle: edge.targetHandle as Json,
            animated: (edge.animated || false) as Json,
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
            workflow_id: dbWorkflowId, // Use the UUID for database
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
            console.error('Error details:', JSON.stringify(error));
          }
        }
      }
    } catch (error) {
      console.error('Error in saveEdgesToDatabase:', error);
    }
  }, [workflowId, isTemporaryId, convertToDbWorkflowId]);

  // Smart schema propagation with retries
  const propagateSchemaWithRetry = useCallback(async (sourceId: string, targetId: string): Promise<boolean> => {
    // Generate a unique key for this edge
    const edgeKey = `${sourceId}-${targetId}`;
    
    try {
      console.log(`Attempting to propagate schema from ${sourceId} to ${targetId}`);
      const result = await propagateFileSchema(sourceId, targetId);
      
      // If successful, reset the retry counter
      if (result) {
        setRetryMap(prev => ({
          ...prev,
          [edgeKey]: { attempts: 0, maxAttempts: 5 }
        }));
        return true;
      } else {
        // If not successful (schema not available yet), set up for retry
        setRetryMap(prev => {
          const currentRetry = prev[edgeKey] || { attempts: 0, maxAttempts: 5 };
          return {
            ...prev,
            [edgeKey]: { 
              attempts: currentRetry.attempts + 1, 
              maxAttempts: currentRetry.maxAttempts
            }
          };
        });
        return false;
      }
    } catch (error) {
      console.error(`Error propagating schema for edge ${edgeKey}:`, error);
      return false;
    }
  }, [propagateFileSchema]);

  // Handle edge changes
  useEffect(() => {
    if (!workflowId) return;
    
    const handleEdgeChanges = () => {
      const currentEdges = reactFlowInstance.getEdges();
      saveEdgesToDatabase(currentEdges);
    };
    
    // Initial save of edges
    handleEdgeChanges();
    
    // Return cleanup function
    return () => {
      // No cleanup needed since we're not using a subscription
    };
  }, [reactFlowInstance, workflowId, saveEdgesToDatabase]);

  // Handle data propagation when connections change with retry mechanism
  useEffect(() => {
    if (!workflowId) return;
    
    const handleEdgeChanges = async () => {
      const currentEdges = reactFlowInstance.getEdges();
      
      // Process each edge to propagate file schemas
      for (const edge of currentEdges) {
        const edgeKey = `${edge.source}-${edge.target}`;
        const retryInfo = retryMap[edgeKey] || { attempts: 0, maxAttempts: 5 };
        
        // Skip if we've exceeded max attempts
        if (retryInfo.attempts >= retryInfo.maxAttempts) {
          console.log(`Skipping schema propagation for ${edgeKey} after ${retryInfo.attempts} failed attempts`);
          continue;
        }
        
        try {
          // Fix: Return a boolean value from propagateSchemaWithRetry and use it directly
          const success = await propagateSchemaWithRetry(edge.source, edge.target);
          
          if (!success && retryInfo.attempts < retryInfo.maxAttempts) {
            // Schedule a retry with exponential backoff
            const backoffTime = Math.min(1000 * Math.pow(2, retryInfo.attempts), 30000); // Max 30 seconds
            console.log(`Scheduling retry for ${edgeKey} in ${backoffTime}ms (attempt ${retryInfo.attempts + 1})`);
            
            setTimeout(async () => {
              console.log(`Retrying schema propagation for ${edgeKey}`);
              await propagateSchemaWithRetry(edge.source, edge.target);
            }, backoffTime);
          }
        } catch (error) {
          console.error(`Error propagating schema for edge from ${edge.source} to ${edge.target}:`, error);
        }
      }
    };
    
    handleEdgeChanges();
    
    // Set up a timer to check for pending schema propagations
    const intervalId = setInterval(() => {
      const currentEdges = reactFlowInstance.getEdges();
      const edgesNeedingRetry = currentEdges.filter(edge => {
        const edgeKey = `${edge.source}-${edge.target}`;
        const retryInfo = retryMap[edgeKey];
        return retryInfo && retryInfo.attempts > 0 && retryInfo.attempts < retryInfo.maxAttempts;
      });
      
      if (edgesNeedingRetry.length > 0) {
        console.log(`Rechecking schema propagation for ${edgesNeedingRetry.length} edges`);
        handleEdgeChanges();
      }
    }, 10000); // Check every 10 seconds
    
    return () => {
      clearInterval(intervalId);
    };
  }, [reactFlowInstance, workflowId, propagateSchemaWithRetry, retryMap]);

  // No rendering needed, this is a utility component
  return null;
};

export default ConnectionHandler;
