import { useEffect, useCallback, useState, useRef } from 'react';
import { useReactFlow, Connection, Edge } from '@xyflow/react';
import { useWorkflow } from './context/WorkflowContext';
import { supabase, convertToDbWorkflowId } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/types/workflow';
import { useDebounce } from '@/hooks/useDebounce';
import { propagateSchemaDirectly } from '@/utils/schemaPropagation';

interface ConnectionHandlerProps {
  workflowId?: string;
}

const ConnectionHandler: React.FC<ConnectionHandlerProps> = ({ workflowId }) => {
  const reactFlowInstance = useReactFlow();
  const { propagateFileSchema, isTemporaryId, convertToDbWorkflowId: contextConvertToDbId } = useWorkflow();
  const [retryMap, setRetryMap] = useState<Record<string, { attempts: number, maxAttempts: number, lastAttempt: number }>>({});
  
  const edgesRef = useRef<Edge[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const debouncedEdges = useDebounce(edges, 500);
  
  const [schemaPropagationStatus, setSchemaPropagationStatus] = useState<Record<string, {
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    message?: string;
    lastAttempt: number;
  }>>({});
  
  const edgesSavePending = useRef(false);
  const edgesSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (workflowId) {
      const isTemp = isTemporaryId(workflowId);
      const dbId = convertToDbWorkflowId(workflowId);
      console.log(`ConnectionHandler initialized with workflowId: ${workflowId}`);
      console.log(`Is temporary ID: ${isTemp}, Database ID: ${dbId}`);
    }
  }, [workflowId, isTemporaryId]);

  const saveEdgesToDatabase = useCallback(async (edgesToSave: Edge[], immediate = false) => {
    if (!workflowId) return;
    
    if (edgesSavePending.current && !immediate) return;
    
    const scheduleSave = () => {
      if (edgesSaveTimeoutRef.current) {
        clearTimeout(edgesSaveTimeoutRef.current);
      }
      
      edgesSavePending.current = true;
      edgesSaveTimeoutRef.current = setTimeout(async () => {
        try {
          console.log(`Saving ${edgesToSave.length} edges for workflow ${workflowId}`);
          
          const dbWorkflowId = convertToDbWorkflowId(workflowId);
          
          if (!dbWorkflowId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbWorkflowId)) {
            console.error(`Invalid workflow ID format for database: ${dbWorkflowId}`);
            edgesSavePending.current = false;
            edgesSaveTimeoutRef.current = null;
            return;
          }
          
          const { error: deleteError } = await supabase
            .from('workflow_edges')
            .delete()
            .eq('workflow_id', dbWorkflowId);
            
          if (deleteError) {
            console.error('Error deleting existing edges:', deleteError);
          }
          
          if (edgesToSave.length > 0) {
            const edgesData = edgesToSave.map(edge => {
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
            
            for (let i = 0; i < edgesData.length; i += 20) {
              const batch = edgesData.slice(i, i + 20);
              const { error } = await supabase
                .from('workflow_edges')
                .insert(batch);
                
              if (error) {
                console.error(`Error saving edges batch ${i}-${i+20}:`, error);
              }
            }
            
            console.log(`Running post-save schema propagation for ${edgesData.length} edges`);
            for (const edge of edgesData) {
              try {
                await propagateSchemaDirectly(
                  workflowId, 
                  edge.source_node_id, 
                  edge.target_node_id
                );
              } catch (err) {
                console.error(`Error in post-save schema propagation for ${edge.source_node_id} -> ${edge.target_node_id}:`, err);
              }
            }
          }
        } catch (error) {
          console.error('Error in saveEdgesToDatabase:', error);
        } finally {
          edgesSavePending.current = false;
          edgesSaveTimeoutRef.current = null;
        }
      }, immediate ? 0 : 1000);
    };
    
    scheduleSave();
  }, [workflowId]);

  const propagateSchemaWithRetry = useCallback(async (sourceId: string, targetId: string): Promise<boolean> => {
    if (!workflowId) return false;
    
    const edgeKey = `${sourceId}-${targetId}`;
    const now = Date.now();
    
    try {
      console.log(`Attempting direct schema propagation from ${sourceId} to ${targetId} for workflow ${workflowId} (isTemp: ${isTemporaryId(workflowId)})`);
      
      const result = await propagateSchemaDirectly(workflowId, sourceId, targetId);
      
      if (result) {
        console.log(`Successfully propagated schema from ${sourceId} to ${targetId}`);
        
        setSchemaPropagationStatus(prev => ({
          ...prev,
          [edgeKey]: {
            status: 'completed',
            lastAttempt: now
          }
        }));
        
        setRetryMap(prev => ({
          ...prev,
          [edgeKey]: { attempts: 0, maxAttempts: 5, lastAttempt: now }
        }));
        
        return true;
      } else {
        console.warn(`Direct schema propagation returned false for ${sourceId} to ${targetId}`);
      }
    } catch (error) {
      console.error(`Direct schema propagation failed from ${sourceId} to ${targetId}:`, error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    const retryInfo = retryMap[edgeKey];
    if (retryInfo) {
      const backoffTime = Math.min(1000 * Math.pow(2, retryInfo.attempts), 30000);
      const timeSinceLastAttempt = now - retryInfo.lastAttempt;
      
      if (retryInfo.attempts > 0 && timeSinceLastAttempt < backoffTime) {
        console.log(`Skipping propagation for ${edgeKey}, attempted too recently (${timeSinceLastAttempt}ms ago, backoff is ${backoffTime}ms)`);
        return false;
      }
    }
    
    try {
      console.log(`Attempting to propagate schema via context method from ${sourceId} to ${targetId} (isTemp: ${isTemporaryId(workflowId)})`);
      
      setSchemaPropagationStatus(prev => ({
        ...prev,
        [edgeKey]: {
          status: 'in_progress',
          lastAttempt: now
        }
      }));
      
      setRetryMap(prev => ({
        ...prev,
        [edgeKey]: { 
          attempts: (prev[edgeKey]?.attempts || 0), 
          maxAttempts: 5,
          lastAttempt: now
        }
      }));
      
      const result = await propagateFileSchema(sourceId, targetId);
      
      if (result) {
        console.log(`Successfully propagated schema via context method from ${sourceId} to ${targetId}`);
        
        setRetryMap(prev => ({
          ...prev,
          [edgeKey]: { attempts: 0, maxAttempts: 5, lastAttempt: now }
        }));
        
        setSchemaPropagationStatus(prev => ({
          ...prev,
          [edgeKey]: {
            status: 'completed',
            lastAttempt: now
          }
        }));
        
        return true;
      } else {
        console.warn(`Failed to propagate schema via context method from ${sourceId} to ${targetId}`);
        
        setRetryMap(prev => {
          const currentRetry = prev[edgeKey] || { attempts: 0, maxAttempts: 5, lastAttempt: now };
          return {
            ...prev,
            [edgeKey]: { 
              attempts: currentRetry.attempts + 1, 
              maxAttempts: currentRetry.maxAttempts,
              lastAttempt: now
            }
          };
        });
        
        setSchemaPropagationStatus(prev => ({
          ...prev,
          [edgeKey]: {
            status: 'error',
            message: 'Failed to propagate schema',
            lastAttempt: now
          }
        }));
        
        return false;
      }
    } catch (error) {
      console.error(`Error propagating schema for edge ${edgeKey}:`, error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
      
      setRetryMap(prev => {
        const currentRetry = prev[edgeKey] || { attempts: 0, maxAttempts: 5, lastAttempt: 0 };
        return {
          ...prev,
          [edgeKey]: { 
            attempts: currentRetry.attempts + 1, 
            maxAttempts: currentRetry.maxAttempts,
            lastAttempt: now
          }
        };
      });
      
      setSchemaPropagationStatus(prev => ({
        ...prev,
        [edgeKey]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          lastAttempt: now
        }
      }));
      
      return false;
    }
  }, [propagateFileSchema, retryMap, workflowId, isTemporaryId]);

  useEffect(() => {
    if (!workflowId) return;
    
    const handleEdgeChanges = () => {
      const currentEdges = reactFlowInstance.getEdges();
      edgesRef.current = currentEdges;
      setEdges(currentEdges);
    };
    
    handleEdgeChanges();
    
    const intervalId = setInterval(() => {
      handleEdgeChanges();
    }, 500);
    
    return () => {
      clearInterval(intervalId);
      
      if (edgesSavePending.current && edgesSaveTimeoutRef.current) {
        clearTimeout(edgesSaveTimeoutRef.current);
        saveEdgesToDatabase(edgesRef.current, true);
      }
    };
  }, [reactFlowInstance, workflowId, saveEdgesToDatabase]);

  useEffect(() => {
    if (!workflowId || debouncedEdges.length === 0) return;
    saveEdgesToDatabase(debouncedEdges);
  }, [debouncedEdges, workflowId, saveEdgesToDatabase]);

  useEffect(() => {
    if (!workflowId) return;
    
    const propagateSchemas = async () => {
      const currentEdges = edgesRef.current;
      
      const sortedEdges = [...currentEdges].sort((a, b) => {
        const keyA = `${a.source}-${a.target}`;
        const keyB = `${b.source}-${b.target}`;
        const attemptsA = retryMap[keyA]?.attempts || 0;
        const attemptsB = retryMap[keyB]?.attempts || 0;
        return attemptsA - attemptsB;
      });
      
      for (const edge of sortedEdges) {
        const edgeKey = `${edge.source}-${edge.target}`;
        const retryInfo = retryMap[edgeKey] || { attempts: 0, maxAttempts: 5, lastAttempt: 0 };
        const statusInfo = schemaPropagationStatus[edgeKey];
        
        if (retryInfo.attempts >= retryInfo.maxAttempts) {
          console.log(`Skipping schema propagation for ${edgeKey} after ${retryInfo.attempts} failed attempts`);
          continue;
        }
        
        if (statusInfo && statusInfo.status === 'in_progress') {
          console.log(`Skipping schema propagation for ${edgeKey} - already in progress`);
          continue;
        }
        
        if (statusInfo && statusInfo.status === 'completed' && (Date.now() - statusInfo.lastAttempt < 10000)) {
          continue;
        }
        
        try {
          setSchemaPropagationStatus(prev => ({
            ...prev,
            [edgeKey]: {
              status: 'pending',
              lastAttempt: Date.now()
            }
          }));
          
          await propagateSchemaWithRetry(edge.source, edge.target);
        } catch (error) {
          console.error(`Error propagating schema for edge from ${edge.source} to ${edge.target}:`, error);
        }
      }
    };
    
    propagateSchemas();
    
    const intervalId = setInterval(() => {
      const now = Date.now();
      const edgesNeedingRetry = edgesRef.current.filter(edge => {
        const edgeKey = `${edge.source}-${edge.target}`;
        const retryInfo = retryMap[edgeKey];
        const statusInfo = schemaPropagationStatus[edgeKey];
        
        if (statusInfo && statusInfo.status === 'error') {
          const backoffTime = Math.min(1000 * Math.pow(2, retryInfo?.attempts || 0), 30000);
          const timeSinceLastAttempt = now - (statusInfo.lastAttempt || 0);
          return timeSinceLastAttempt >= backoffTime;
        }
        
        if (retryInfo && retryInfo.attempts > 0 && retryInfo.attempts < retryInfo.maxAttempts) {
          const backoffTime = Math.min(1000 * Math.pow(2, retryInfo.attempts), 30000);
          const timeSinceLastAttempt = now - retryInfo.lastAttempt;
          return timeSinceLastAttempt >= backoffTime;
        }
        
        return false;
      });
      
      if (edgesNeedingRetry.length > 0) {
        console.log(`Rechecking schema propagation for ${edgesNeedingRetry.length} edges`);
        propagateSchemas();
      }
    }, 10000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [reactFlowInstance, workflowId, propagateSchemaWithRetry, retryMap, schemaPropagationStatus]);

  return null;
};

export default ConnectionHandler;
