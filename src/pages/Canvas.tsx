
import { useState, useEffect, useCallback, MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
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
    handleAddNode
  } = useNodeManagement(setNodes, () => saveWorkflowToDb(nodes, edges));

  const { status: executionStatus, subscriptionStatus } = useWorkflowRealtime({
    executionId,
    workflowId: savingWorkflowId,
    onStatusChange: (status) => {
      console.log(`Workflow status changed to: ${status}`);
    }
  });

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  const saveWorkflow = useCallback(() => {
    return saveWorkflowToDb(nodes, edges);
  }, [saveWorkflowToDb, nodes, edges]);

  useEffect(() => {
    if (workflowId && workflowId !== 'new') {
      if (workflowId.startsWith('temp-')) {
        console.log('Loading workflow with temporary ID:', workflowId);
      } else {
        loadWorkflow(workflowId, setNodes, setEdges);
      }
    }
  }, [workflowId, loadWorkflow]);

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
    <WorkflowProvider workflowId={savingWorkflowId || undefined}>
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
