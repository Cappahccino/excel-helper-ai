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
      console.log(`Saving edges for workflow ${workflowId}, isTemporary: ${isTemporaryId}`);
      
      const dbWorkflowId = convertToDbWorkflowId(workflowId);
      
      await supabase
        .from('workflow_edges')
        .delete()
        .eq('workflow_id', dbWorkflowId);
      
      if (edges.length > 0) {
        const edgesData = edges.map(edge => {
          const safeMetadata: Record<string, Json> = {
            sourceHandle: edge.sourceHandle as Json,
            targetHandle: edge.targetHandle as Json,
            animated: (edge.animated || false) as Json,
          };
          
          if (edge.label && typeof edge.label === 'string') {
            safeMetadata.label = edge.label as Json;
          }
          
          if (edge.data && typeof edge.data === 'object') {
            try {
              JSON.stringify(edge.data);
              safeMetadata.data = edge.data as Json;
            } catch (e) {
              console.warn('Edge data could not be serialized:', e);
            }
          }
          
          return {
            workflow_id: dbWorkflowId,
            source_node_id: edge.source,
            target_node_id: edge.target,
            edge_id: edge.id,
            edge_type: edge.type || 'default',
            metadata: safeMetadata
          };
        });
        
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

  // Smart schema propagation with retries - modified to ensure it returns a Promise<boolean>
  const propagateSchemaWithRetry = useCallback(async (sourceId: string, targetId: string): Promise<boolean> => {
    const edgeKey = `${sourceId}-${targetId}`;
    
    try {
      console.log(`Attempting to propagate schema from ${sourceId} to ${targetId}`);
      const result = await propagateFileSchema(sourceId, targetId);
      
      if (result) {
        setRetryMap(prev => ({
          ...prev,
          [edgeKey]: { attempts: 0, maxAttempts: 5 }
        }));
        return true;
      } else {
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
    
    handleEdgeChanges();
    
    return () => {};
  }, [reactFlowInstance, workflowId, saveEdgesToDatabase]);

  useEffect(() => {
    if (!workflowId) return;
    
    const handleEdgeChanges = async () => {
      const currentEdges = reactFlowInstance.getEdges();
      
      for (const edge of currentEdges) {
        const edgeKey = `${edge.source}-${edge.target}`;
        const retryInfo = retryMap[edgeKey] || { attempts: 0, maxAttempts: 5 };
        
        if (retryInfo.attempts >= retryInfo.maxAttempts) {
          console.log(`Skipping schema propagation for ${edgeKey} after ${retryInfo.attempts} failed attempts`);
          continue;
        }
        
        try {
          const success = await propagateSchemaWithRetry(edge.source, edge.target);
          
          if (!success && retryInfo.attempts < retryInfo.maxAttempts) {
            const backoffTime = Math.min(1000 * Math.pow(2, retryInfo.attempts), 30000);
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
    }, 10000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [reactFlowInstance, workflowId, propagateSchemaWithRetry, retryMap]);

  return null;
};

export default ConnectionHandler;
