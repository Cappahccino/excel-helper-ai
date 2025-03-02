
import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  Panel, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Node,
  Edge,
  Connection,
  OnNodesChange,
  OnEdgesChange
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Save, Play, Plus, Settings, FileJson, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider } from "@/components/ui/sidebar-new";
import { mapDatabaseWorkflowToWorkflow, WorkflowNode, WorkflowDefinition, WorkflowNodeData } from "@/types/workflow";
import DataInputNode from "@/components/workflow/nodes/DataInputNode";
import DataProcessingNode from "@/components/workflow/nodes/DataProcessingNode";
import AINode from "@/components/workflow/nodes/AINode";
import OutputNode from "@/components/workflow/nodes/OutputNode";
import IntegrationNode from "@/components/workflow/nodes/IntegrationNode";
import ControlNode from "@/components/workflow/nodes/ControlNode";
import SpreadsheetGeneratorNode from "@/components/workflow/nodes/SpreadsheetGeneratorNode";
import NodeLibrary from "@/components/workflow/NodeLibrary";
import NodeConfigPanel from "@/components/workflow/NodeConfigPanel";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";

// Define node types for the flow
const nodeTypes = {
  dataInput: DataInputNode,
  dataProcessing: DataProcessingNode,
  aiNode: AINode,
  output: OutputNode,
  integration: IntegrationNode,
  control: ControlNode,
  spreadsheetGenerator: SpreadsheetGeneratorNode
};

interface NodeCategory {
  name: string;
  id: string;
  nodes: Array<{
    name: string;
    type: string;
    description: string;
  }>;
}

const Canvas = () => {
  // Router and state hooks
  const { workflowId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Workflow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDesc, setWorkflowDesc] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Load workflow data if workflowId is provided
  const { 
    data: workflow, 
    isLoading: workflowLoading,
    refetch: refetchWorkflow
  } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: async () => {
      if (!workflowId) return null;
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .maybeSingle();
        
      if (error) throw error;
      
      if (data) {
        const parsedWorkflow = mapDatabaseWorkflowToWorkflow(data);
        return parsedWorkflow;
      }
      return null;
    },
    enabled: !!workflowId
  });

  // Initialize workflow from data
  useEffect(() => {
    if (workflow) {
      setWorkflowName(workflow.name);
      setWorkflowDesc(workflow.description || "");
      setNodes(workflow.definition.nodes as Node[]);
      setEdges(workflow.definition.edges as Edge[]);
    }
  }, [workflow, setNodes, setEdges]);

  // Create a new workflow and navigate to it
  const createNewWorkflow = async () => {
    try {
      setIsProcessing(true);
      
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("User not authenticated");
      
      const { data, error } = await supabase.from('workflows').insert({
        name: 'Untitled Workflow',
        description: '',
        created_by: userData.user.id,
        definition: JSON.stringify({ nodes: [], edges: [] }),
        status: 'draft',
        trigger_type: 'manual',
        is_template: false
      }).select().single();
      
      if (error) throw error;
      
      navigate(`/canvas/${data.id}`);
      toast({
        title: "Success",
        description: "New workflow created",
      });
    } catch (error) {
      console.error('Failed to create workflow:', error);
      toast({
        title: "Error",
        description: "Failed to create workflow",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Save current workflow
  const saveWorkflow = async (name?: string, description?: string) => {
    if (!workflowId) return;
    
    try {
      setIsProcessing(true);
      
      const saveData = {
        name: name || workflowName || "Untitled Workflow",
        description: description || workflowDesc || "",
        definition: JSON.stringify({ nodes, edges }),
      };
      
      const { error } = await supabase
        .from('workflows')
        .update(saveData)
        .eq('id', workflowId);
        
      if (error) throw error;
      
      setWorkflowName(saveData.name);
      setWorkflowDesc(saveData.description);
      
      toast({
        title: "Success",
        description: "Workflow saved successfully",
      });
      
      setShowSaveDialog(false);
      refetchWorkflow();
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast({
        title: "Error",
        description: "Failed to save workflow",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute workflow
  const runWorkflow = async () => {
    if (!workflowId) return;
    
    try {
      setIsProcessing(true);
      
      const { data, error } = await supabase
        .rpc('start_workflow_execution', { 
          workflow_id: workflowId,
          inputs: {}
        });
        
      if (error) throw error;
      
      toast({
        title: "Workflow Started",
        description: `Execution ID: ${data?.execution_id || 'unknown'}`,
      });
    } catch (error) {
      console.error('Error running workflow:', error);
      toast({
        title: "Error",
        description: "Failed to run workflow",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle node selection
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node as WorkflowNode);
    setIsConfigOpen(true);
  }, []);

  // Handle node deselection
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setIsConfigOpen(false);
  }, []);

  // Handle edge connections
  const onConnect = useCallback((connection: Connection) => {
    setEdges(edges => addEdge(connection, edges));
    
    // Trigger autosave when connecting edges
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      if (workflowId) saveWorkflow();
    }, 2000);
    
    setAutoSaveTimeout(timeoutId);
  }, [setEdges, workflowId, autoSaveTimeout, saveWorkflow]);

  // Handle node configuration updates
  const updateNodeConfig = useCallback((config: any) => {
    if (!selectedNode) return;
    
    setNodes(nodes => 
      nodes.map(node => 
        node.id === selectedNode.id 
          ? { 
              ...node, 
              data: config
            } 
          : node
      )
    );
    
    // Trigger autosave when updating node config
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      if (workflowId) saveWorkflow();
    }, 2000);
    
    setAutoSaveTimeout(timeoutId);
  }, [selectedNode, setNodes, workflowId, autoSaveTimeout, saveWorkflow]);

  // Handle adding new nodes from the library
  const onAddNode = useCallback((nodeType: string, nodeCategory: string, nodeName: string) => {
    // Create unique ID
    const id = `${nodeType}_${Date.now()}`;
    
    // Define default config based on node type
    let defaultConfig = {};
    if (nodeType.includes('excel') || nodeType.includes('csv')) {
      defaultConfig = { fileId: null, hasHeaders: true };
    } else if (nodeType.includes('ai')) {
      defaultConfig = { prompt: "", analysisType: "general" };
    } else if (nodeType.includes('spreadsheet')) {
      defaultConfig = { filename: "output.xlsx", sheets: [] };
    }
    
    // Create new node
    const newNode: WorkflowNode = {
      id,
      type: nodeCategory,
      position: { x: 100, y: 100 },
      data: {
        label: nodeName,
        type: nodeType,
        config: defaultConfig
      } as WorkflowNodeData
    };
    
    setNodes((nodes) => [...nodes, newNode as Node]);
    setIsLibraryOpen(false);
    
    // Trigger autosave when adding new node
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      if (workflowId) saveWorkflow();
    }, 2000);
    
    setAutoSaveTimeout(timeoutId);
  }, [setNodes, workflowId, autoSaveTimeout, saveWorkflow]);

  // Handle node deletion
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    
    // Remove connected edges
    setEdges(edges => 
      edges.filter(edge => 
        edge.source !== selectedNode.id && edge.target !== selectedNode.id
      )
    );
    
    // Remove node
    setNodes(nodes => 
      nodes.filter(node => node.id !== selectedNode.id)
    );
    
    setSelectedNode(null);
    setIsConfigOpen(false);
    
    // Trigger autosave when deleting node
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      if (workflowId) saveWorkflow();
    }, 2000);
    
    setAutoSaveTimeout(timeoutId);
  }, [selectedNode, setNodes, setEdges, workflowId, autoSaveTimeout, saveWorkflow]);

  // Handle node duplication
  const duplicateSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    
    // Create duplicate with new ID
    const newId = `${selectedNode.id}_copy_${Date.now()}`;
    const duplicatedNode = {
      ...selectedNode,
      id: newId,
      position: {
        x: (selectedNode.position?.x || 0) + 50,
        y: (selectedNode.position?.y || 0) + 50
      }
    };
    
    setNodes(nodes => [...nodes, duplicatedNode as Node]);
    
    // Trigger autosave when duplicating node
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      if (workflowId) saveWorkflow();
    }, 2000);
    
    setAutoSaveTimeout(timeoutId);
  }, [selectedNode, setNodes, workflowId, autoSaveTimeout, saveWorkflow]);

  // Cleanup autosave on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
    };
  }, [autoSaveTimeout]);

  // Node categories for library
  const nodeCategories: NodeCategory[] = [
    { 
      name: 'Data Input', 
      id: 'dataInput',
      nodes: [
        { name: 'Excel Input', type: 'excelInput', description: 'Import data from Excel file' },
        { name: 'CSV Input', type: 'csvInput', description: 'Import data from CSV file' },
        { name: 'API Source', type: 'apiSource', description: 'Fetch data from API' },
        { name: 'User Input', type: 'userInput', description: 'Accept user defined input' }
      ]
    },
    { 
      name: 'Data Processing', 
      id: 'dataProcessing',
      nodes: [
        { name: 'Transform', type: 'dataTransform', description: 'Transform data structure' },
        { name: 'Clean Data', type: 'dataCleaning', description: 'Clean and format data' },
        { name: 'Formula', type: 'formulaNode', description: 'Apply formula to data' },
        { name: 'Filter', type: 'filterNode', description: 'Filter data based on conditions' }
      ]
    },
    { 
      name: 'AI', 
      id: 'aiNode',
      nodes: [
        { name: 'Analyze', type: 'aiAnalyze', description: 'Analyze data with AI' },
        { name: 'Classify', type: 'aiClassify', description: 'Classify data with AI' },
        { name: 'Summarize', type: 'aiSummarize', description: 'Summarize data with AI' }
      ]
    },
    { 
      name: 'Output', 
      id: 'output',
      nodes: [
        { name: 'Excel Output', type: 'excelOutput', description: 'Export data to Excel' },
        { name: 'Dashboard', type: 'dashboardOutput', description: 'Create visualization dashboard' },
        { name: 'Email Notify', type: 'emailNotify', description: 'Send email notification' }
      ]
    },
    { 
      name: 'Integrations', 
      id: 'integration',
      nodes: [
        { name: 'Xero', type: 'xeroConnect', description: 'Connect to Xero accounting' },
        { name: 'Salesforce', type: 'salesforceConnect', description: 'Connect to Salesforce CRM' },
        { name: 'Google Sheets', type: 'googleSheetsConnect', description: 'Connect to Google Sheets' }
      ]
    },
    { 
      name: 'Control', 
      id: 'control',
      nodes: [
        { name: 'Conditional', type: 'conditionalBranch', description: 'Create conditional branch' },
        { name: 'Loop', type: 'loopNode', description: 'Loop through data' },
        { name: 'Merge', type: 'mergeNode', description: 'Merge multiple data sources' }
      ]
    },
    { 
      name: 'Generators', 
      id: 'spreadsheetGenerator',
      nodes: [
        { name: 'Spreadsheet', type: 'spreadsheetGenerator', description: 'Generate complete spreadsheet' }
      ]
    }
  ];

  return (
    <SidebarProvider>
      <div className="flex flex-col h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/workflows')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">
                {workflowName || 'Untitled Workflow'}
              </h1>
              <p className="text-sm text-gray-500">
                {workflowDesc || 'No description'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!workflowId ? (
              <Button 
                onClick={createNewWorkflow} 
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Workflow
              </Button>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setShowSaveDialog(true)} 
                  disabled={isProcessing}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button 
                  variant="default" 
                  onClick={runWorkflow} 
                  disabled={isProcessing || nodes.length === 0}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Run
                </Button>
              </>
            )}
          </div>
        </div>
      
        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Workflow canvas */}
          <div className="flex-1 h-full" ref={reactFlowWrapper}>
            {workflowLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Loading workflow...</span>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.1}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
              >
                <Panel position="top-right">
                  <Tabs defaultValue="nodes" className="w-[300px]">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="nodes">Nodes</TabsTrigger>
                      <TabsTrigger value="settings">Settings</TabsTrigger>
                    </TabsList>
                    <TabsContent value="nodes" className="bg-white border rounded-md mt-2">
                      <Button 
                        className="w-full"
                        onClick={() => setIsLibraryOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Node
                      </Button>
                    </TabsContent>
                    <TabsContent value="settings" className="bg-white border rounded-md mt-2 p-4">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Workflow Name</label>
                          <Input 
                            value={workflowName} 
                            onChange={(e) => setWorkflowName(e.target.value)}
                            placeholder="Enter workflow name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Description</label>
                          <Input 
                            value={workflowDesc} 
                            onChange={(e) => setWorkflowDesc(e.target.value)}
                            placeholder="Enter description"
                          />
                        </div>
                        <Button 
                          className="w-full"
                          onClick={() => saveWorkflow(workflowName, workflowDesc)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save Changes
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </Panel>
                <Controls />
                <MiniMap 
                  nodeStrokeColor={(n) => {
                    if (n.id === selectedNode?.id) return '#ff0072';
                    return '#ddd';
                  }}
                  nodeColor={(n) => {
                    switch (n.type) {
                      case 'dataInput': return '#d0eaff';
                      case 'dataProcessing': return '#e6f9e6';
                      case 'aiNode': return '#f8e3ff';
                      case 'output': return '#ffe6e6';
                      case 'integration': return '#fff4cc';
                      case 'control': return '#e6e6ff';
                      case 'spreadsheetGenerator': return '#ccf2e8';
                      default: return '#eee';
                    }
                  }}
                />
                <Background gap={16} size={1} />
              </ReactFlow>
            )}
          </div>
          
          {/* Config panel */}
          {isConfigOpen && selectedNode && (
            <div className="w-96 border-l border-gray-200 bg-white overflow-auto">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="font-semibold">Node Configuration</h2>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsConfigOpen(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="h-[calc(100vh-10rem)]">
                <NodeConfigPanel 
                  node={selectedNode}
                  onUpdateConfig={updateNodeConfig}
                  onDelete={deleteSelectedNode}
                  onDuplicate={duplicateSelectedNode}
                  onClose={() => setIsConfigOpen(false)}
                  readOnly={false}
                />
              </ScrollArea>
            </div>
          )}
        </div>
        
        {/* Node library dialog */}
        <NodeLibrary 
          isOpen={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          onAddNode={onAddNode}
          nodeCategories={nodeCategories}
        />
        
        {/* Save workflow dialog */}
        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Workflow</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Workflow Name</label>
                <Input 
                  value={workflowName} 
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="Enter workflow name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input 
                  value={workflowDesc} 
                  onChange={(e) => setWorkflowDesc(e.target.value)}
                  placeholder="Enter workflow description (optional)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => saveWorkflow(workflowName, workflowDesc)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SidebarProvider>
  );
};

export default Canvas;
