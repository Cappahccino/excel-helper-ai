
import { useState, useEffect, useCallback, MouseEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useNodesState, useEdgesState, addEdge, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WorkflowProvider } from '@/components/workflow/context/WorkflowContext';
import { useTemporaryId } from '@/hooks/useTemporaryId';
import { useWorkflowRealtime } from '@/hooks/useWorkflowRealtime';
import { useWorkflowDatabase } from '@/hooks/useWorkflowDatabase';
import { useNodeManagement } from '@/hooks/useNodeManagement';

import NodeLibrary from '@/components/workflow/NodeLibrary';
import StepLogPanel from '@/components/workflow/StepLogPanel';
import WorkflowHeader from '@/components/canvas/WorkflowHeader';
import WorkflowSettings from '@/components/canvas/WorkflowSettings';
import CanvasFlow from '@/components/canvas/CanvasFlow';
import { nodeCategories } from '@/components/canvas/NodeCategories';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

declare global {
  interface Window {
    saveWorkflowTimeout?: number;
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
  const [showTemporaryWorkflowAlert, setShowTemporaryWorkflowAlert] = useState<boolean>(false);
  
  const [savingWorkflowId, setSavingWorkflowId] = useTemporaryId('workflow', 
    workflowId === 'new' ? null : workflowId,
    workflowId === 'new' || (workflowId && workflowId.startsWith('temp-'))
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

  // Check if we're on a temporary workflow
  useEffect(() => {
    if (savingWorkflowId && savingWorkflowId.startsWith('temp-') && workflowId === 'new') {
      setShowTemporaryWorkflowAlert(true);
      
      // Auto-save temporary workflow when nodes/edges change
      const autoSaveTimeout = setTimeout(() => {
        if (nodes.length > 0 || edges.length > 0) {
          console.log('Auto-saving temporary workflow...');
          saveWorkflowToDb(nodes, edges);
        }
      }, 5000);
      
      return () => clearTimeout(autoSaveTimeout);
    } else {
      setShowTemporaryWorkflowAlert(false);
    }
  }, [savingWorkflowId, workflowId, nodes, edges, saveWorkflowToDb]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const newEdges = addEdge(params, eds);
      
      if (params.source && params.target) {
        updateSchemaPropagationMap(params.source, params.target);
        
        // Trigger schema propagation immediately
        setTimeout(() => {
          triggerSchemaUpdate(params.source);
        }, 500);
      }
      
      return newEdges;
    });
    
    // Save workflow after connecting nodes
    if (savingWorkflowId) {
      setTimeout(() => saveWorkflowToDb(nodes, edges), 1000);
    }
  }, [setEdges, updateSchemaPropagationMap, triggerSchemaUpdate, saveWorkflowToDb, nodes, edges, savingWorkflowId]);

  const saveWorkflow = useCallback(() => {
    return saveWorkflowToDb(nodes, edges);
  }, [saveWorkflowToDb, nodes, edges]);

  // Perform auto-save for temporary workflows
  useEffect(() => {
    if (workflowId === 'new' && nodes.length > 0) {
      const saveTimer = setTimeout(() => {
        saveWorkflow().then(savedId => {
          if (savedId && savedId !== workflowId && savedId !== 'new') {
            console.log(`Workflow saved with ID: ${savedId}`);
            if (!savingWorkflowId.startsWith('temp-') && savingWorkflowId !== savedId) {
              navigate(`/canvas/${savedId}`, { replace: true });
            }
          }
        });
      }, 3000);
      
      return () => clearTimeout(saveTimer);
    }
  }, [nodes, edges, workflowId, saveWorkflow, savingWorkflowId, navigate]);

  useEffect(() => {
    if (workflowId && workflowId !== 'new') {
      if (workflowId.startsWith('temp-')) {
        console.log('Loading workflow with temporary ID:', workflowId);
      } else {
        loadWorkflow(workflowId, setNodes, setEdges);
      }
    }
  }, [workflowId, loadWorkflow, setNodes, setEdges]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
    setShowLogPanel(true);
  }, [setSelectedNodeId]);

  const handleRunWorkflow = useCallback(() => {
    // Always save before running
    saveWorkflow().then(savedId => {
      if (savedId) {
        runWorkflow(savedId, nodes, edges, setIsRunning, setExecutionId);
      } else {
        toast.error('Failed to save workflow before running');
      }
    });
  }, [nodes, edges, runWorkflow, saveWorkflow, setIsRunning]);

  const handleAddNodeClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setIsAddingNode(true);
  }, []);

  // Create adapter functions that satisfy the WorkflowContext type expectations
  const getNodeSchemaAdapter = useCallback((nodeId: string) => {
    if (!savingWorkflowId) return [];
    // Call the full function but provide defaults that the adapter doesn't need to worry about
    return getNodeSchema(savingWorkflowId, nodeId, { forceRefresh: false });
  }, [getNodeSchema, savingWorkflowId]);

  const updateNodeSchemaAdapter = useCallback((nodeId: string, schema: any) => {
    if (!savingWorkflowId) return;
    // Call the full function with the workflow ID
    updateNodeSchema(savingWorkflowId, nodeId, schema);
  }, [updateNodeSchema, savingWorkflowId]);

  return (
    <WorkflowProvider 
      workflowId={savingWorkflowId || undefined}
      schemaProviderValue={{
        getNodeSchema: getNodeSchemaAdapter,
        updateNodeSchema: updateNodeSchemaAdapter,
        checkSchemaCompatibility,
      }}
    >
      <div className="h-screen flex flex-col">
        {showTemporaryWorkflowAlert && (
          <Alert variant="default" className="m-4 border-amber-300 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Temporary Workflow</AlertTitle>
            <AlertDescription className="text-amber-700">
              You're working on a temporary workflow. To keep your changes permanently, 
              please save this workflow when you're done.
            </AlertDescription>
          </Alert>
        )}
        
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
            handleAddNode(nodeType, nodeCategory, nodeLabel);
            toast.success(`Added ${nodeLabel} node to canvas`);
          }}
          nodeCategories={nodeCategories}
        />
      </div>
    </WorkflowProvider>
  );
};

export default Canvas;
