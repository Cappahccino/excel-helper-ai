import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { WorkflowNode, Edge } from '@/types/workflow';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';

export function useWorkflowDatabase(
  workflowId: string | null, 
  setSavingWorkflowId: (id: string | null) => void
) {
  const [workflowName, setWorkflowName] = useState<string>('New Workflow');
  const [workflowDescription, setWorkflowDescription] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [optimisticSave, setOptimisticSave] = useState<boolean>(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const navigate = useNavigate();
  const workflow = useWorkflow();
  
  const loadWorkflow = async (workflowId: string, setNodes: (nodes: WorkflowNode[]) => void, setEdges: (edges: any[]) => void) => {
    if (!workflowId || workflowId === 'new' || workflowId.startsWith('temp-')) return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setWorkflowName(data.name || 'New Workflow');
        setWorkflowDescription(data.description || '');
        
        setSavingWorkflowId(data.id);
        
        const definition = typeof data.definition === 'string' 
          ? JSON.parse(data.definition) 
          : data.definition;
        
        if (definition.nodes) {
          setNodes(definition.nodes as WorkflowNode[]);
        }
        
        const edgesFromDb = await loadEdgesFromDatabase(data.id);
        
        if (edgesFromDb && edgesFromDb.length > 0) {
          setEdges(edgesFromDb);
        } else if (definition.edges) {
          setEdges(definition.edges);
        }

        if (data.last_run_at) {
          const lastRunDate = new Date(data.last_run_at);
          const now = new Date();
          const diffMinutes = (now.getTime() - lastRunDate.getTime()) / (1000 * 60);
          
          if (diffMinutes < 60) {
            const lastStatus = data.last_run_status != null ? String(data.last_run_status) : 'unknown';
            console.log(`Retrieved workflow with status: ${lastStatus}`);
          }
        }
      }
    } catch (error) {
      console.error('Error loading workflow:', error);
      toast.error('Failed to load workflow');
    } finally {
      setIsLoading(false);
    }
  };

  const loadEdgesFromDatabase = async (workflowId: string): Promise<Edge[] | null> => {
    try {
      const { data, error } = await supabase
        .from('workflow_edges')
        .select('*')
        .eq('workflow_id', workflowId);
      
      if (error) {
        console.error('Error loading edges:', error);
        return null;
      }
      
      if (data && data.length > 0) {
        return data.map(edge => {
          const metadata = edge.metadata as Record<string, any> || {};
          
          return {
            id: edge.edge_id || `${edge.source_node_id}-${edge.target_node_id}`,
            source: edge.source_node_id,
            target: edge.target_node_id,
            type: edge.edge_type !== 'default' ? edge.edge_type : undefined,
            sourceHandle: metadata.sourceHandle?.toString(),
            targetHandle: metadata.targetHandle?.toString(),
            label: typeof metadata.label === 'string' ? metadata.label : undefined,
            animated: metadata.animated === true,
            data: metadata.data || undefined
          };
        });
      }
      
      return null;
    } catch (error) {
      console.error('Error in loadEdgesFromDatabase:', error);
      return null;
    }
  };

  const ensureUniqueWorkflowName = async (baseName: string): Promise<string> => {
    if (workflowId) {
      return baseName;
    }

    let newName = baseName;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const { data, error } = await supabase
        .from('workflows')
        .select('id')
        .eq('name', newName)
        .limit(1);
      
      if (error) {
        console.error('Error checking workflow name:', error);
        return newName;
      }
      
      if (data && data.length === 0) {
        isUnique = true;
      } else {
        newName = `${baseName}${counter}`;
        counter++;
      }
    }
    
    return newName;
  };

  const saveWorkflow = async (nodes: WorkflowNode[], edges: Edge[]) => {
    try {
      setIsSaving(true);
      const userId = (await supabase.auth.getUser()).data.user?.id;
      
      if (!userId) {
        toast.error('User not authenticated');
        return null;
      }
      
      const uniqueName = await ensureUniqueWorkflowName(workflowName || 'New Workflow');
      if (uniqueName !== workflowName) {
        setWorkflowName(uniqueName);
        toast.info(`Name updated to "${uniqueName}" to ensure uniqueness`);
      }
      
      const workflowData = {
        name: uniqueName,
        description: workflowDescription,
        definition: JSON.stringify({
          nodes,
          edges,
        }),
        user_id: userId,
        created_by: userId,
      };
      
      let response;
      let savedWorkflowId;
      let isTemporaryWorkflow = workflowId?.startsWith('temp-') || false;
      
      setOptimisticSave(true);
      
      if (workflowId && !workflowId.startsWith('temp-')) {
        response = await supabase
          .from('workflows')
          .update(workflowData)
          .eq('id', workflowId)
          .select('id');
        
        savedWorkflowId = workflowId;
      } else {
        response = await supabase
          .from('workflows')
          .insert(workflowData)
          .select('id');
        
        if (response.data && response.data[0]) {
          savedWorkflowId = response.data[0].id;
          
          if (isTemporaryWorkflow && savedWorkflowId && workflow.migrateTemporaryWorkflow) {
            try {
              const migrationSuccess = await workflow.migrateTemporaryWorkflow(
                workflowId!, 
                savedWorkflowId
              );
              
              if (!migrationSuccess) {
                setMigrationError('Migration partially completed. Some data might need to be re-entered.');
                toast.warning('Some workflow data could not be migrated. Please check your configuration.');
              }
            } catch (error) {
              console.error('Error during workflow data migration:', error);
              setMigrationError('Failed to migrate workflow data');
            }
          }
          
          setSavingWorkflowId(savedWorkflowId);
          
          if (workflowId === 'new' || isTemporaryWorkflow) {
            navigate(`/canvas/${savedWorkflowId}`, { replace: true });
          }
        }
      }
      
      if (response && response.error) throw response.error;
      
      toast.success('Workflow saved successfully');
      
      setOptimisticSave(false);
      
      return savedWorkflowId;
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error('Failed to save workflow');
      
      setOptimisticSave(false);
      
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const runWorkflow = async (savingWorkflowId: string | null, nodes: WorkflowNode[], edges: Edge[], setIsRunning: (running: boolean) => void, setExecutionId: (id: string | null) => void) => {
    setIsRunning(true);
    
    try {
      const workflowIdToRun = savingWorkflowId || await saveWorkflow(nodes, edges);
      
      if (!workflowIdToRun) {
        toast.error('Please save the workflow before running it');
        setIsRunning(false);
        return;
      }

      const { data, error } = await supabase
        .rpc('start_workflow_execution', { workflow_id: workflowIdToRun });

      if (error) throw error;
      
      toast.success('Workflow execution started');
      
      if (data && typeof data === 'object' && 'execution_id' in data) {
        const newExecutionId = data.execution_id as string;
        setExecutionId(newExecutionId);
        console.log('Execution ID:', newExecutionId);
      }
    } catch (error) {
      console.error('Error running workflow:', error);
      toast.error('Failed to run workflow');
    } finally {
      setIsRunning(false);
    }
  };

  return {
    workflowName,
    setWorkflowName,
    workflowDescription,
    setWorkflowDescription,
    isLoading,
    isSaving,
    optimisticSave,
    migrationError,
    loadWorkflow,
    saveWorkflow,
    runWorkflow
  };
}
