import { useState, useEffect, useCallback, MouseEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useNodesState, useEdgesState, addEdge, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WorkflowProvider } from '@/components/workflow/context/WorkflowContext';
import { useTemporaryId } from '@/hooks/useTemporaryId';
import { useWorkflowRealtime } from '@/hooks/useWorkflowRealtime';
import { useWorkflowDatabase } from '@/hooks/useWorkflowDatabase';
import { useNodeManagement, SchemaColumn } from '@/hooks/useNodeManagement';
import { useWorkflowSync } from '@/hooks/useWorkflowSync';
import { WorkflowUpdateType } from '@/hooks/useWorkflowSyncState';

import NodeLibrary from '@/components/workflow/NodeLibrary';
import WorkflowHeader from '@/components/canvas/WorkflowHeader';
import WorkflowSettings from '@/components/canvas/WorkflowSettings';
import CanvasFlow from '@/components/canvas/CanvasFlow';
import { nodeCategories } from '@/components/canvas/NodeCategories';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { checkSchemaPropagationNeeded } from '@/utils/schemaPropagation';
import { retryOperation } from '@/utils/retryUtils';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    saveWorkflowTimeout?: number;
    workflowContext?: any;
  }
}

const Canvas = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isAddingNode, setIsAddingNode] = useState<boolean>(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [showLogPanel, setShowLogPanel] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [workflowStateInitialized, setWorkflowStateInitialized] = useState<boolean>(false);
  
  const isNewWorkflow = workflowId === 'new';
  const isTemporaryWorkflow = workflowId && workflowId.startsWith('temp-');
  
  // For new workflows, don't create a temp ID in database yet - will create on save
  // This is important - we only set the temporary ID once and avoid repeated creation
  const [savingWorkflowId, setSavingWorkflowId] = useTemporaryId('workflow', 
    isNewWorkflow ? 'new' : workflowId,
    isNewWorkflow || isTemporaryWorkflow
  );
  
  const {
    workflowName,
    setWorkflowName,
    workflowDescription,
    setWorkflowDescription,
    isLoading,
    isSaving,
    optimisticSave,
    migrationError,
    loadWorkflow,
    saveWorkflow: saveWorkflowToDb,
    runWorkflow
  } = useWorkflowDatabase(savingWorkflowId, setSavingWorkflowId);

  // Setup workflow sync but don't automatically sync on every change
  const { syncWorkflow, forceSyncNow } = useWorkflowSync(
    savingWorkflowId, 
    nodes, 
    edges, 
    isSaving
  );

  const {
    selectedNodeId,
    setSelectedNodeId,
    handleNodeConfigUpdate,
    handleAddNode,
    updateSchemaPropagationMap,
    triggerSchemaUpdate,
    getNodeSchema,
    updateNodeSchema,
    checkSchemaCompatibility
  } = useNodeManagement(setNodes, () => {
    // Instead of immediately saving workflow, trigger a sync with schema update type
    if (savingWorkflowId && savingWorkflowId !== 'new') {
      syncWorkflow(WorkflowUpdateType.SCHEMA);
    }
  });

  const { status: executionStatus, subscriptionStatus } = useWorkflowRealtime({
    executionId,
    workflowId: savingWorkflowId,
    onStatusChange: (status) => {
      console.log(`Workflow status changed to: ${status}`);
    }
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getUser();
      
      if (error || !data.user) {
        console.log('Not authenticated, redirecting to login');
        toast.error('Please log in to create or edit workflows');
        navigate('/auth');
        return;
      }
      
      setIsAuthenticated(true);
    };
    
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (isAuthenticated && workflowId && workflowId !== 'new' && !workflowStateInitialized) {
      console.log(`Loading workflow data for ID: ${workflowId}`);
      loadWorkflow(workflowId, setNodes, setEdges).then(() => {
        setWorkflowStateInitialized(true);
      });
    }
    
    if (isNewWorkflow && !workflowStateInitialized) {
      console.log('Creating new workflow');
      setWorkflowName('New Workflow');
      setWorkflowDescription('');
      setNodes([]);
      setEdges([]);
      setWorkflowStateInitialized(true);
    }
  }, [workflowId, isAuthenticated, loadWorkflow, setNodes, setEdges, workflowStateInitialized]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const newEdges = addEdge(params, eds);
      
      if (params.source && params.target) {
        updateSchemaPropagationMap(params.source, params.target);
        
        if (savingWorkflowId && savingWorkflowId !== 'new') {
          const workflow = window.workflowContext;
          
          if (workflow && workflow.queueSchemaPropagation) {
            console.log(`Queueing schema propagation on edge creation: ${params.source} -> ${params.target}`);
            workflow.queueSchemaPropagation(params.source, params.target);
            
            setTimeout(() => {
              checkSchemaPropagationNeeded(savingWorkflowId, params.source, params.target)
                .then(needed => {
                  if (needed) {
                    console.log(`Schema propagation needed for ${params.source} -> ${params.target}`);
                    triggerSchemaUpdate(params.source);
                    toast.info("Updating schema from source node...", { id: "schema-update" });
                    
                    // Sync workflow with schema update type
                    syncWorkflow(WorkflowUpdateType.SCHEMA);
                  }
                });
            }, 1000);
          } else {
            retryOperation(
              () => {
                console.log(`Using fallback schema propagation method for ${params.source} -> ${params.target}`);
                return window.propagateSchemaDirectly 
                  ? window.propagateSchemaDirectly(savingWorkflowId, params.source, params.target)
                  : Promise.resolve(false);
              },
              {
                maxRetries: 3,
                delay: 500,
                onRetry: (err, attempt) => {
                  console.log(`Retrying schema propagation on connect (${attempt}/3): ${err.message}`);
                }
              }
            ).then(success => {
              if (success) {
                console.log(`Successfully propagated schema on edge creation: ${params.source} -> ${params.target}`);
                toast.success("Schema propagated successfully", { id: "schema-propagation" });
              } else {
                console.log(`Initial schema propagation failed, scheduling retry`);
                setTimeout(() => {
                  checkSchemaPropagationNeeded(savingWorkflowId, params.source, params.target)
                    .then(needed => {
                      if (needed) {
                        triggerSchemaUpdate(params.source);
                        toast.info("Updating schema from source node...", { id: "schema-update" });
                        
                        // Sync workflow with schema update type
                        syncWorkflow(WorkflowUpdateType.SCHEMA);
                      }
                    });
                }, 1000);
              }
            });
          }
        }
      }
      
      // Sync workflow with structure update type
      if (savingWorkflowId && savingWorkflowId !== 'new') {
        syncWorkflow(WorkflowUpdateType.STRUCTURE);
      }
      
      return newEdges;
    });
  }, [setEdges, updateSchemaPropagationMap, triggerSchemaUpdate, savingWorkflowId, syncWorkflow]);

  // Handle node changes separately to avoid constant sync operations
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    
    // Only sync for position changes if we actually moved nodes (not for selection changes)
    const hasMoved = changes.some(change => change.type === 'position' && (change.position?.x || change.position?.y));
    
    if (hasMoved && savingWorkflowId && savingWorkflowId !== 'new') {
      // Sync with minor update type for position changes
      syncWorkflow(WorkflowUpdateType.MINOR);
    }
  }, [onNodesChange, savingWorkflowId, syncWorkflow]);

  useEffect(() => {
    if (window) {
      const workflowContextElement = document.getElementById('workflow-context-provider');
      if (workflowContextElement) {
        const workflowContextData = workflowContextElement.getAttribute('data-context');
        if (workflowContextData) {
          try {
            window.workflowContext = JSON.parse(workflowContextData);
          } catch (e) {
            console.error('Failed to parse workflow context data', e);
          }
        }
      }
    }
  }, []);

  const getNodeSchemaAdapter = useCallback((nodeId: string): SchemaColumn[] => {
    return getNodeSchema(nodeId) || [];
  }, [getNodeSchema]);

  const updateNodeSchemaAdapter = useCallback((nodeId: string, schema: SchemaColumn[]): void => {
    updateNodeSchema(nodeId, schema);
    
    // Sync workflow with schema update type
    if (savingWorkflowId && savingWorkflowId !== 'new') {
      syncWorkflow(WorkflowUpdateType.SCHEMA);
    }
  }, [updateNodeSchema, savingWorkflowId, syncWorkflow]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
  }, [setSelectedNodeId]);

  const handleRunWorkflow = useCallback(() => {
    if (savingWorkflowId === 'new') {
      // If new workflow, save first
      handleSaveWorkflow().then((id) => {
        if (id) {
          runWorkflow(id, nodes, edges, setIsRunning, setExecutionId);
        }
      });
    } else {
      // For existing workflow, run directly
      runWorkflow(savingWorkflowId, nodes, edges, setIsRunning, setExecutionId);
    }
  }, [savingWorkflowId, nodes, edges, runWorkflow]);

  const handleAddNodeClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setIsAddingNode(true);
  }, []);

  const handleSaveWorkflow = useCallback(async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to save your workflow');
      navigate('/auth');
      return null;
    }
    
    console.log(`Saving workflow with ID: ${savingWorkflowId}, nodes: ${nodes.length}, edges: ${edges.length}`);
    
    // Force sync before saving
    if (savingWorkflowId !== 'new') {
      await forceSyncNow();
    }
    
    const savedId = await saveWorkflowToDb(nodes, edges);
    if (savedId) {
      console.log(`Workflow saved successfully with ID: ${savedId}`);
      return savedId;
    } else {
      console.error('Failed to save workflow');
      return null;
    }
  }, [isAuthenticated, savingWorkflowId, nodes, edges, saveWorkflowToDb, navigate, forceSyncNow]);

  if (!isAuthenticated && workflowId !== 'new') {
    return <div className="flex items-center justify-center h-screen">Checking authentication...</div>;
  }

  return (
    <WorkflowProvider 
      workflowId={savingWorkflowId || undefined}
      executionId={executionId}
      schemaProviderValue={{
        getNodeSchema: getNodeSchemaAdapter,
        updateNodeSchema: updateNodeSchemaAdapter,
        checkSchemaCompatibility,
      }}
    >
      <div id="workflow-context-provider" data-context={JSON.stringify({workflowId: savingWorkflowId})} style={{display: 'none'}}></div>
      <div className="h-screen flex flex-col">
        <WorkflowHeader 
          workflowName={workflowName}
          workflowDescription={workflowDescription}
          onWorkflowNameChange={(e) => setWorkflowName(e.target.value)}
          onWorkflowDescriptionChange={(e) => setWorkflowDescription(e.target.value)}
          onSave={handleSaveWorkflow}
          onRun={handleRunWorkflow}
          isSaving={isSaving}
          isRunning={isRunning}
          executionStatus={executionStatus}
          savingWorkflowId={savingWorkflowId}
          migrationError={migrationError}
          optimisticSave={optimisticSave}
          subscriptionStatus={subscriptionStatus}
        />
        
        <div className="flex-1 flex">
          <Tabs defaultValue="canvas" className="w-full">
            <TabsList className="px-4 pt-2">
              <TabsTrigger value="canvas">Canvas</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="canvas" className="flex-1 h-full">
              <div className="h-full">
                <CanvasFlow 
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  handleNodeConfigUpdate={handleNodeConfigUpdate}
                  workflowId={savingWorkflowId}
                  executionId={executionId}
                  onAddNodeClick={handleAddNodeClick}
                  showLogPanel={showLogPanel}
                  setShowLogPanel={setShowLogPanel}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="settings">
              <WorkflowSettings 
                executionStatus={executionStatus}
                savingWorkflowId={savingWorkflowId}
                executionId={executionId}
                nodesCount={nodes.length}
                edgesCount={edges.length}
              />
            </TabsContent>
          </Tabs>
        </div>

        <NodeLibrary
          isOpen={isAddingNode}
          onClose={() => setIsAddingNode(false)}
          onAddNode={(nodeType, nodeCategory, nodeLabel) => {
            handleAddNode(nodeType as any, nodeCategory, nodeLabel);
            toast.success(`Added ${nodeLabel} node to canvas`);
            
            // Sync workflow with structure update type after adding node
            if (savingWorkflowId && savingWorkflowId !== 'new') {
              syncWorkflow(WorkflowUpdateType.STRUCTURE);
            }
          }}
          nodeCategories={nodeCategories}
        />
      </div>
    </WorkflowProvider>
  );
};

export default Canvas;
