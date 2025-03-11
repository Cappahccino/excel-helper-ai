
import { useEffect, useCallback, useState, useRef } from 'react';
import { useReactFlow, Connection, Edge } from '@xyflow/react';
import { useWorkflow } from './context/WorkflowContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/types/workflow';
import { useDebounce } from '@/hooks/useDebounce';
import { schemaUtils } from '@/utils/schemaUtils';

interface ConnectionHandlerProps {
  workflowId?: string;
}

const ConnectionHandler: React.FC<ConnectionHandlerProps> = ({ workflowId }) => {
  const reactFlowInstance = useReactFlow();
  const { isTemporaryId } = useWorkflow();
  const { convertToDbWorkflowId } = useWorkflow();
  const [retryMap, setRetryMap] = useState<Record<string, { attempts: number, maxAttempts: number, lastAttempt: number }>>({});
  
  // Use a ref for edge changes to avoid unnecessary effect triggers
  const edgesRef = useRef<Edge[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const debouncedEdges = useDebounce(edges, 500);
  
  // We'll batch save operations with a 1 second debounce 
  const edgesSavePending = useRef(false);
  const edgesSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Optimized edge saving with debounce and batching
  const saveEdgesToDatabase = useCallback(async (edgesToSave: Edge[], immediate = false) => {
    if (!workflowId) return;
    
    // If we're already planning to save, don't schedule another save
    // unless we're forcing an immediate save
    if (edgesSavePending.current && !immediate) return;
    
    const scheduleSave = () => {
      // Clear any existing timeout
      if (edgesSaveTimeoutRef.current) {
        clearTimeout(edgesSaveTimeoutRef.current);
      }
      
      // Set up a new save operation
      edgesSavePending.current = true;
      edgesSaveTimeoutRef.current = setTimeout(async () => {
        try {
          console.log(`Saving ${edgesToSave.length} edges for workflow ${workflowId}`);
          
          const dbWorkflowId = convertToDbWorkflowId(workflowId);
          
          await supabase
            .from('workflow_edges')
            .delete()
            .eq('workflow_id', dbWorkflowId);
          
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
            
            // Increase batch size for fewer round trips
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
        } finally {
          edgesSavePending.current = false;
          edgesSaveTimeoutRef.current = null;
        }
      }, immediate ? 0 : 1000); // 1 second debounce, 0 if immediate
    };
    
    scheduleSave();
  }, [workflowId, convertToDbWorkflowId]);

  // More efficient schema propagation with prioritized retries
  const propagateSchemaWithRetry = useCallback(async (sourceId: string, targetId: string): Promise<boolean> => {
    const edgeKey = `${sourceId}-${targetId}`;
    const now = Date.now();
    
    // Check if we should skip this attempt due to recent failure
    const retryInfo = retryMap[edgeKey];
    if (retryInfo) {
      const backoffTime = Math.min(1000 * Math.pow(2, retryInfo.attempts), 30000);
      const timeSinceLastAttempt = now - retryInfo.lastAttempt;
      
      // If we've tried recently and failed, skip this attempt
      if (retryInfo.attempts > 0 && timeSinceLastAttempt < backoffTime) {
        console.log(`Skipping propagation for ${edgeKey}, attempted too recently (${timeSinceLastAttempt}ms ago, backoff is ${backoffTime}ms)`);
        return false;
      }
    }
    
    try {
      console.log(`Attempting to propagate schema from ${sourceId} to ${targetId}`);
      
      // Update retry info before attempting
      setRetryMap(prev => ({
        ...prev,
        [edgeKey]: { 
          attempts: (prev[edgeKey]?.attempts || 0), 
          maxAttempts: 5,
          lastAttempt: now
        }
      }));
      
      // Use schemaUtils for propagation
      const result = await schemaUtils.propagateSchema(workflowId, sourceId, targetId);
      
      if (result) {
        // Success - reset retry data
        setRetryMap(prev => ({
          ...prev,
          [edgeKey]: { attempts: 0, maxAttempts: 5, lastAttempt: now }
        }));
        return true;
      } else {
        // Failure - increment attempts
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
        return false;
      }
    } catch (error) {
      console.error(`Error propagating schema for edge ${edgeKey}:`, error);
      
      // Update retry tracking on error
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
      
      return false;
    }
  }, [workflowId, retryMap]);

  // Track edges efficiently
  useEffect(() => {
    if (!workflowId) return;
    
    const handleEdgeChanges = () => {
      const currentEdges = reactFlowInstance.getEdges();
      edgesRef.current = currentEdges;
      setEdges(currentEdges);
    };
    
    // Initial save and track
    handleEdgeChanges();
    
    // Set up an interval to check for edge changes
    const intervalId = setInterval(() => {
      handleEdgeChanges();
    }, 500);
    
    return () => {
      clearInterval(intervalId);
      
      // Force save any pending changes on unmount
      if (edgesSavePending.current && edgesSaveTimeoutRef.current) {
        clearTimeout(edgesSaveTimeoutRef.current);
        saveEdgesToDatabase(edgesRef.current, true);
      }
    };
  }, [reactFlowInstance, workflowId, saveEdgesToDatabase]);

  // Debounced edge saving
  useEffect(() => {
    if (!workflowId || debouncedEdges.length === 0) return;
    saveEdgesToDatabase(debouncedEdges);
  }, [debouncedEdges, workflowId, saveEdgesToDatabase]);

  // Optimized schema propagation with prioritization
  useEffect(() => {
    if (!workflowId) return;
    
    const propagateSchemas = async () => {
      const currentEdges = edgesRef.current;
      
      // Sort edges by retry attempts (prioritize ones that haven't failed)
      const sortedEdges = [...currentEdges].sort((a, b) => {
        const keyA = `${a.source}-${a.target}`;
        const keyB = `${b.source}-${b.target}`;
        const attemptsA = retryMap[keyA]?.attempts || 0;
        const attemptsB = retryMap[keyB]?.attempts || 0;
        return attemptsA - attemptsB;
      });
      
      // Process each edge
      for (const edge of sortedEdges) {
        const edgeKey = `${edge.source}-${edge.target}`;
        const retryInfo = retryMap[edgeKey] || { attempts: 0, maxAttempts: 5, lastAttempt: 0 };
        
        if (retryInfo.attempts >= retryInfo.maxAttempts) {
          console.log(`Skipping schema propagation for ${edgeKey} after ${retryInfo.attempts} failed attempts`);
          continue;
        }
        
        try {
          await propagateSchemaWithRetry(edge.source, edge.target);
        } catch (error) {
          console.error(`Error propagating schema for edge from ${edge.source} to ${edge.target}:`, error);
        }
      }
    };
    
    propagateSchemas();
    
    // Set up interval for retry logic - but make it smarter
    const intervalId = setInterval(() => {
      // Only process if there are edges that need retrying
      const now = Date.now();
      const edgesNeedingRetry = edgesRef.current.filter(edge => {
        const edgeKey = `${edge.source}-${edge.target}`;
        const retryInfo = retryMap[edgeKey];
        
        // Check if this edge needs a retry based on backoff strategy
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
  }, [reactFlowInstance, workflowId, propagateSchemaWithRetry, retryMap]);

  return null;
};

export default ConnectionHandler;
