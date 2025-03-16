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
    if (workflowId && workflowId !== 'new' && !workflowId.startsWith('temp-')) {
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
        newName = `${baseName} ${counter}`;
        counter++;
      }
    }
    
    return newName;
  };

  const saveWorkflow = async (nodes: WorkflowNode[], edges: Edge[]) => {
    try {
      // Check authentication first
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) {
        console.error('Authentication error:', authError);
        toast.error('You must be logged in to save a workflow');
        return null;
      }
      
      const userId = userData.user.id;
      
      setIsSaving(true);
      console.log(`Saving workflow. Current ID: ${workflowId}, User ID: ${userId}`);
      
      // Ensure workflow name is unique
      const uniqueName = await ensureUniqueWorkflowName(workflowName || 'New Workflow');
      if (uniqueName !== workflowName) {
        setWorkflowName(uniqueName);
        toast.info(`Name updated to "${uniqueName}" to ensure uniqueness`);
      }
      
      // Prepare workflow data
      const workflowData = {
        name: uniqueName,
        description: workflowDescription,
        definition: JSON.stringify({
          nodes,
          edges,
        }),
        created_by: userId,
        status: 'draft',
        trigger_type: 'manual',
        version: 1,
        is_temporary: workflowId?.startsWith('temp-') || workflowId === 'new' || false,
        is_template: false
      };
      
      let response;
      let savedWorkflowId;
      let isTemporaryWorkflow = workflowId?.startsWith('temp-') || workflowId === 'new' || false;
      
      setOptimisticSave(true);
      
      console.log(`Saving workflow. Is temporary: ${isTemporaryWorkflow}, Workflow ID: ${workflowId}`);
      
      if (workflowId && workflowId !== 'new' && !workflowId.startsWith('temp-')) {
        // Update existing workflow
        console.log(`Updating existing workflow: ${workflowId}`);
        response = await supabase
          .from('workflows')
          .update(workflowData)
          .eq('id', workflowId)
          .select('id');
        
        savedWorkflowId = workflowId;
        
        if (response.error) {
          console.error('Error updating workflow:', response.error);
          throw new Error(`Failed to update workflow: ${response.error.message}`);
        }
      } else {
        // Create new workflow
        console.log(`Creating new workflow with name: ${uniqueName}`);
        response = await supabase
          .from('workflows')
          .insert(workflowData)
          .select('id');
        
        if (response.error) {
          console.error('Error creating workflow:', response.error);
          throw new Error(`Failed to create workflow: ${response.error.message}`);
        }
        
        if (response.data && response.data[0]) {
          savedWorkflowId = response.data[0].id;
          console.log(`New workflow created with ID: ${savedWorkflowId}`);
          
          if (isTemporaryWorkflow && savedWorkflowId && workflow.migrateTemporaryWorkflow) {
            try {
              console.log(`Migrating temporary workflow data from ${workflowId} to ${savedWorkflowId}`);
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
            console.log(`Redirecting to new workflow URL: /canvas/${savedWorkflowId}`);
            navigate(`/canvas/${savedWorkflowId}`, { replace: true });
          }
        } else {
          console.error('No workflow ID returned after creation', response);
          throw new Error('Failed to create workflow: No ID returned');
        }
      }
      
      toast.success('Workflow saved successfully');
      setOptimisticSave(false);
      
      // Also save edges separately for better performance on future loads
      if (savedWorkflowId && edges.length > 0) {
        await saveEdgesToDatabase(savedWorkflowId, edges);
      }
      
      return savedWorkflowId;
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error(`Failed to save workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      setOptimisticSave(false);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const saveEdgesToDatabase = async (workflowId: string, edges: Edge[]) => {
    try {
      if (!edges.length) return;
      
      console.log(`Saving ${edges.length} edges for workflow ${workflowId}`);
      
      // Remove existing edges
      const { error: deleteError } = await supabase
        .from('workflow_edges')
        .delete()
        .eq('workflow_id', workflowId);
        
      if (deleteError) {
        console.error('Error deleting existing edges:', deleteError);
        return;
      }
      
      // Insert new edges
      const edgesToInsert = edges.map(edge => {
        // Extract metadata from the edge object
        const { id, source, target, type, sourceHandle, targetHandle, label, animated, data, ...rest } = edge;
        
        // Build metadata object
        const metadata: Record<string, any> = {};
        if (sourceHandle) metadata.sourceHandle = sourceHandle;
        if (targetHandle) metadata.targetHandle = targetHandle;
        if (label) metadata.label = label;
        if (animated) metadata.animated = animated;
        if (data) metadata.data = data;
        if (Object.keys(rest).length > 0) Object.assign(metadata, rest);
        
        return {
          workflow_id: workflowId,
          source_node_id: source,
          target_node_id: target,
          edge_id: id,
          edge_type: type || 'default',
          metadata
        };
      });
      
      const { error: insertError } = await supabase
        .from('workflow_edges')
        .insert(edgesToInsert);
        
      if (insertError) {
        console.error('Error inserting edges:', insertError);
      } else {
        console.log(`Successfully saved ${edges.length} edges to database`);
      }
    } catch (error) {
      console.error('Error in saveEdgesToDatabase:', error);
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
