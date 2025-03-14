
import { useState, useEffect, useCallback, MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useNodesState, useEdgesState, addEdge, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WorkflowProvider } from '@/components/workflow/context/WorkflowContext';
import { useTemporaryId } from '@/hooks/useTemporaryId';
import { useWorkflowRealtime } from '@/hooks/useWorkflowRealtime';
import { useWorkflowDatabase } from '@/hooks/useWorkflowDatabase';
import { useNodeManagement, SchemaColumn } from '@/hooks/useNodeManagement';
import { useWorkflowSync } from '@/hooks/useWorkflowSync';

import NodeLibrary from '@/components/workflow/NodeLibrary';
import StepLogPanel from '@/components/workflow/StepLogPanel';
import WorkflowHeader from '@/components/canvas/WorkflowHeader';
import WorkflowSettings from '@/components/canvas/WorkflowSettings';
import CanvasFlow from '@/components/canvas/CanvasFlow';
import { nodeCategories } from '@/components/canvas/NodeCategories';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { propagateSchemaDirectly, checkSchemaPropagationNeeded } from '@/utils/schemaPropagation';
import { retryOperation } from '@/utils/retryUtils';

declare global {
  interface Window {
    saveWorkflowTimeout?: number;
  }
}

const Canvas = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isAddingNode, setIsAddingNode] = useState<boolean>(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [showLogPanel, setShowLogPanel] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  // Determine if we need a new temp ID or to use an existing one
  const isNewWorkflow = workflowId === 'new';
  const isTemporaryWorkflow = workflowId && workflowId.startsWith('temp-');
  
  const [savingWorkflowId, setSavingWorkflowId] = useTemporaryId('workflow', 
    isNewWorkflow ? null : workflowId,
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

  useWorkflowSync(savingWorkflowId, nodes, edges, isSaving);

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
  } = useNodeManagement(setNodes, () => saveWorkflowToDb(nodes, edges));

  const { status: executionStatus, subscriptionStatus } = useWorkflowRealtime({
    executionId,
    workflowId: savingWorkflowId,
    onStatusChange: (status) => {
      console.log(`Workflow status changed to: ${status}`);
    }
  });

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const newEdges = addEdge(params, eds);
      
      if (params.source && params.target) {
        updateSchemaPropagationMap(params.source, params.target);
        
        if (savingWorkflowId) {
          retryOperation(
            () => propagateSchemaDirectly(savingWorkflowId, params.source, params.target),
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
                    }
                  });
              }, 1000);
            }
          });
        }
      }
      
      return newEdges;
    });
  }, [setEdges, updateSchemaPropagationMap, triggerSchemaUpdate, savingWorkflowId]);

  const saveWorkflow = useCallback(() => {
    return saveWorkflowToDb(nodes, edges);
  }, [saveWorkflowToDb, nodes, edges]);

  useEffect(() => {
    // Skip loading if we're on the "new" workflow page
    if (isNewWorkflow) {
      setIsInitialized(true);
      return;
    }
    
    // Skip loading for temporary IDs until they're properly initialized in the DB
    if (isTemporaryWorkflow && !isInitialized) {
      const checkInitTimer = setTimeout(() => {
        setIsInitialized(true);
      }, 1500);
      return () => clearTimeout(checkInitTimer);
    }
    
    // Load existing workflow when ID is available and not temporary
    if (workflowId && !isNewWorkflow && isInitialized) {
      loadWorkflow(workflowId, setNodes, setEdges);
    }
  }, [workflowId, loadWorkflow, isInitialized, isNewWorkflow, isTemporaryWorkflow]);

  const getNodeSchemaAdapter = useCallback((nodeId: string): SchemaColumn[] => {
    return getNodeSchema(nodeId) || [];
  }, [getNodeSchema]);

  const updateNodeSchemaAdapter = useCallback((nodeId: string, schema: SchemaColumn[]): void => {
    updateNodeSchema(nodeId, schema);
  }, [updateNodeSchema]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
    setShowLogPanel(true);
  }, []);

  const handleRunWorkflow = useCallback(() => {
    runWorkflow(savingWorkflowId, nodes, edges, setIsRunning, setExecutionId);
  }, [savingWorkflowId, nodes, edges, runWorkflow]);

  const handleAddNodeClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setIsAddingNode(true);
  }, []);

  return (
    <WorkflowProvider 
      workflowId={savingWorkflowId || undefined}
      executionId={executionId} // Pass executionId to the WorkflowProvider
      schemaProviderValue={{
        getNodeSchema: getNodeSchemaAdapter,
        updateNodeSchema: updateNodeSchemaAdapter,
        checkSchemaCompatibility,
      }}
    >
      <div className="h-screen flex flex-col">
        <WorkflowHeader 
          workflowName={workflowName}
          workflowDescription={workflowDescription}
          onWorkflowNameChange={(e) => setWorkflowName(e.target.value)}
          onWorkflowDescriptionChange={(e) => setWorkflowDescription(e.target.value)}
          onSave={saveWorkflow}
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
                  onNodesChange={onNodesChange}
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

              {showLogPanel && (
                <StepLogPanel
                  nodeId={selectedNodeId}
                  executionId={executionId}
                  workflowId={savingWorkflowId}
                  onClose={() => setShowLogPanel(false)}
                />
              )}
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
          }}
          nodeCategories={nodeCategories}
        />
      </div>
    </WorkflowProvider>
  );
};

export default Canvas;
