import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Panel,
  Connection,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Save, Play, Undo, Redo } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';

// Node components
import DataInputNode from '@/components/workflow/nodes/DataInputNode';
import DataProcessingNode from '@/components/workflow/nodes/DataProcessingNode';
import AINode from '@/components/workflow/nodes/AINode';
import OutputNode from '@/components/workflow/nodes/OutputNode';
import IntegrationNode from '@/components/workflow/nodes/IntegrationNode';
import ControlNode from '@/components/workflow/nodes/ControlNode';
import SpreadsheetGeneratorNode from '@/components/workflow/nodes/SpreadsheetGeneratorNode';

// Import types
import { WorkflowNode, WorkflowNodeData, Edge } from '@/types/workflow';

// Define component for Canvas
const Canvas = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const [workflowName, setWorkflowName] = useState('New Workflow');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [nodeLibraryOpen, setNodeLibraryOpen] = useState(false);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nodeCategories, setNodeCategories] = useState<any[]>([]);
  const [loadingWorkflow, setLoadingWorkflow] = useState(true);
  const [loadingExecution, setLoadingExecution] = useState(false);
  const [history, setHistory] = useState<{ nodes: WorkflowNode[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Setup node types
  const nodeTypes: NodeTypes = {
    dataInput: DataInputNode,
    dataProcessing: DataProcessingNode,
    aiNode: AINode,
    outputNode: OutputNode,
    integrationNode: IntegrationNode,
    controlNode: ControlNode,
    spreadsheetGenerator: SpreadsheetGeneratorNode,
  };

  // Load workflow data
  useEffect(() => {
    if (workflowId && workflowId !== 'new') {
      fetchWorkflow(workflowId);
    } else {
      setLoadingWorkflow(false);
      // Initialize with empty history
      setHistory([{ nodes: [], edges: [] }]);
      setHistoryIndex(0);
    }
    
    // Setup node categories
    setupNodeCategories();
  }, [workflowId]);

  // Setup node categories for the node library
  const setupNodeCategories = () => {
    const categories = [
      {
        id: 'input',
        name: 'Input',
        description: 'Data input nodes',
        nodes: [
          { name: 'Excel Input', type: 'excelInput', description: 'Import data from Excel files' },
          { name: 'CSV Input', type: 'csvInput', description: 'Import data from CSV files' },
          { name: 'API Source', type: 'apiSource', description: 'Fetch data from APIs' },
          { name: 'User Input', type: 'userInput', description: 'Get input from users' }
        ]
      },
      {
        id: 'processing',
        name: 'Processing',
        description: 'Data transformation nodes',
        nodes: [
          { name: 'Transform', type: 'dataTransform', description: 'Transform data structure' },
          { name: 'Data Cleaning', type: 'dataCleaning', description: 'Clean and prepare data' },
          { name: 'Formula', type: 'formulaNode', description: 'Apply formulas to data' },
          { name: 'Filter', type: 'filterNode', description: 'Filter data based on conditions' }
        ]
      },
      {
        id: 'ai',
        name: 'AI & Analytics',
        description: 'AI-powered data analysis',
        nodes: [
          { name: 'AI Analysis', type: 'aiAnalyze', description: 'Analyze data with AI' },
          { name: 'AI Classification', type: 'aiClassify', description: 'Categorize data with AI' },
          { name: 'AI Summarization', type: 'aiSummarize', description: 'Summarize data with AI' }
        ]
      },
      {
        id: 'output',
        name: 'Output',
        description: 'Data output destinations',
        nodes: [
          { name: 'Excel Output', type: 'excelOutput', description: 'Export data to Excel' },
          { name: 'Dashboard', type: 'dashboardOutput', description: 'Create interactive dashboards' },
          { name: 'Email Notification', type: 'emailNotify', description: 'Send email notifications' }
        ]
      },
      {
        id: 'integration',
        name: 'Integrations',
        description: 'Connect to external services',
        nodes: [
          { name: 'Xero', type: 'xeroConnect', description: 'Connect to Xero accounting' },
          { name: 'Salesforce', type: 'salesforceConnect', description: 'Connect to Salesforce CRM' },
          { name: 'Google Sheets', type: 'googleSheetsConnect', description: 'Connect to Google Sheets' }
        ]
      },
      {
        id: 'control',
        name: 'Flow Control',
        description: 'Control workflow execution',
        nodes: [
          { name: 'Condition', type: 'conditionalBranch', description: 'Branch based on conditions' },
          { name: 'Loop', type: 'loopNode', description: 'Loop over data items' },
          { name: 'Merge', type: 'mergeNode', description: 'Merge multiple data streams' }
        ]
      },
      {
        id: 'spreadsheet',
        name: 'Spreadsheet',
        description: 'Spreadsheet generation',
        nodes: [
          { name: 'Spreadsheet Generator', type: 'spreadsheetGenerator', description: 'Generate complex Excel spreadsheets' }
        ]
      }
    ];
    
    setNodeCategories(categories);
  };

  // Fetch workflow from Supabase
  const fetchWorkflow = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setWorkflowName(data.name);
        setWorkflowDescription(data.description || '');
        
        const definition = typeof data.definition === 'string'
          ? JSON.parse(data.definition)
          : data.definition;
        
        if (definition && definition.nodes && definition.edges) {
          setNodes(definition.nodes);
          setEdges(definition.edges);
          
          // Initialize history with the loaded workflow
          setHistory([{ nodes: definition.nodes, edges: definition.edges }]);
          setHistoryIndex(0);
        }
      }
    } catch (error) {
      console.error('Error loading workflow:', error);
      toast.error('Failed to load workflow');
    } finally {
      setLoadingWorkflow(false);
    }
  };

  // Record history when nodes or edges change
  const recordHistory = useCallback(
    (newNodes: WorkflowNode[], newEdges: Edge[]) => {
      if (historyIndex < history.length - 1) {
        // If we're not at the end of the history, truncate it
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({ nodes: newNodes, edges: newEdges });
        setHistory(newHistory);
        setHistoryIndex(historyIndex + 1);
      } else {
        // Just add to the end of the history
        setHistory([...history, { nodes: newNodes, edges: newEdges }]);
        setHistoryIndex(historyIndex + 1);
      }
    },
    [history, historyIndex]
  );

  // Handle undo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevState = history[prevIndex];
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setHistoryIndex(prevIndex);
    }
  };

  // Handle redo
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextState = history[nextIndex];
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(nextIndex);
    }
  };

  // Connect nodes
  const onConnect = useCallback((connection: Connection) => {
    const newEdges = addEdge({
      ...connection,
      animated: true,
      style: { stroke: '#555' },
    }, edges);
    setEdges(newEdges);
    recordHistory(nodes, newEdges);
  }, [nodes, edges, recordHistory]);

  // Handle node click
  const onNodeClick = useCallback((event: React.MouseEvent, node: WorkflowNode) => {
    setSelectedNode(node);
    setConfigPanelOpen(true);
  }, []);

// Save workflow
const saveWorkflow = async () => {
  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    if (!userId) {
      toast.error('User not authenticated');
      return;
    }
    
    const workflow = {
      name: workflowName,
      description: workflowDescription,
      definition: JSON.stringify({
        nodes,
        edges,
      }),
      user_id: userId,
      created_by: userId, // Add this to satisfy the TypeScript constraint
    };
    
    let response;
    
    if (workflowId && workflowId !== 'new') {
      // Update existing workflow
      response = await supabase
        .from('workflows')
        .update(workflow)
        .eq('id', workflowId);
    } else {
      // Create new workflow
      response = await supabase
        .from('workflows')
        .insert(workflow);
    }
    
    if (response.error) throw response.error;
    
    toast.success('Workflow saved successfully');
  } catch (error) {
    console.error('Error saving workflow:', error);
    toast.error('Failed to save workflow');
  }
};

  // Run workflow
  const runWorkflow = async () => {
    if (!workflowId || workflowId === 'new') {
      toast.error('Please save the workflow before running it');
      return;
    }
    
    setLoadingExecution(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('run-workflow', {
        body: {
          workflow_id: workflowId,
        },
      });
      
      if (error) throw error;
      
      toast.success(`Workflow execution started: ${data.execution_id}`);
    } catch (error) {
      console.error('Error running workflow:', error);
      toast.error('Failed to run workflow');
    } finally {
      setLoadingExecution(false);
    }
  };

  // Update node configuration
  const handleNodeConfigUpdate = (updatedConfig: Partial<WorkflowNodeData>) => {
    if (!selectedNode) return;
    
    const updatedNodes = nodes.map(node => {
      if (node.id === selectedNode.id) {
        return {
          ...node,
          data: {
            ...node.data,
            ...updatedConfig,
          },
        };
      }
      return node;
    });
    
    setNodes(updatedNodes);
    recordHistory(updatedNodes, edges);
    
    // Update selected node
    const updatedNode = updatedNodes.find(n => n.id === selectedNode.id);
    if (updatedNode) {
      setSelectedNode(updatedNode);
    }
  };

  // Delete node
  const handleNodeDelete = () => {
    if (!selectedNode) return;
    
    const newNodes = nodes.filter(n => n.id !== selectedNode.id);
    const newEdges = edges.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id);
    
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNode(null);
    setConfigPanelOpen(false);
    
    recordHistory(newNodes, newEdges);
  };

  // Duplicate node
  const handleNodeDuplicate = () => {
    if (!selectedNode) return;
    
    const nodeId = `node-${uuidv4()}`;
    const duplicatedNode = {
      ...selectedNode,
      id: nodeId,
      position: {
        x: selectedNode.position.x + 50,
        y: selectedNode.position.y + 50,
      },
      selected: false,
    };
    
    const newNodes = [...nodes, duplicatedNode];
    setNodes(newNodes);
    recordHistory(newNodes, edges);
  };

  // Add node to the canvas
  const handleAddNode = (nodeType: string, nodeCategory: string, nodeName: string) => {
    // Find the category and node definition
    const category = nodeCategories.find(c => c.id === nodeCategory);
    const nodeDefinition = category?.nodes.find(n => n.type === nodeType);
    
    if (!nodeDefinition) {
      console.error(`Node type ${nodeType} not found in category ${nodeCategory}`);
      return;
    }
    
    // Map node category to component type
    const getNodeComponentType = (category: string) => {
      switch (category) {
        case 'input': return 'dataInput';
        case 'processing': return 'dataProcessing';
        case 'ai': return 'aiNode';
        case 'output': return 'outputNode';
        case 'integration': return 'integrationNode';
        case 'control': return 'controlNode';
        case 'spreadsheet': return 'spreadsheetGenerator';
        default: return 'dataInput';
      }
    };
    
    // Create default config for the node
    const getDefaultConfig = (type: string) => {
      switch (type) {
        case 'excelInput':
        case 'csvInput':
          return { fileId: null, hasHeaders: true };
        case 'spreadsheetGenerator':
          return { filename: 'generated.xlsx', sheets: [] };
        default:
          return {};
      }
    };
    
    // Create the new node
    const nodeId = `node-${uuidv4()}`;
    const newNode = {
      id: nodeId,
      type: getNodeComponentType(nodeCategory),
      position: { x: 100, y: 100 }, // Default position, can be adjusted later
      data: {
        type: nodeType,
        label: nodeName,
        config: getDefaultConfig(nodeType),
      },
    } as WorkflowNode;
    
    // Add node to canvas
    const newNodes = [...nodes, newNode];
    setNodes(newNodes);
    recordHistory(newNodes, edges);
    
    // Close node library
    setNodeLibraryOpen(false);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top toolbar */}
      <div className="bg-white border-b p-2 flex justify-between items-center">
        <div className="flex items-center">
          <h1 className="font-bold text-lg mr-4">{workflowName}</h1>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
            >
              <Redo className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline"
            onClick={saveWorkflow}
          >
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
          <Button 
            size="sm" 
            variant="default"
            onClick={runWorkflow}
            disabled={loadingExecution || nodes.length === 0}
          >
            <Play className="h-4 w-4 mr-1" />
            Run
          </Button>
        </div>
      </div>
      
      {/* Workflow canvas */}
      <div className="flex-grow relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          fitView
          attributionPosition="bottom-right"
        >
          <Background />
          <Controls />
          <MiniMap />
          
          <Panel position="top-left" className="m-2">
            <Button 
              onClick={() => setNodeLibraryOpen(true)}
              size="sm"
            >
              Add Node
            </Button>
          </Panel>
        </ReactFlow>
        
        {/* Node library */}
        <Sheet open={nodeLibraryOpen} onOpenChange={setNodeLibraryOpen}>
          <SheetContent side={isMobile ? "bottom" : "left"} className={isMobile ? "h-[80vh]" : ""}>
            <div className="h-full overflow-auto">
              <h2 className="font-bold text-xl mb-4">Node Library</h2>
              
              <div className="space-y-6">
                {nodeCategories.map((category) => (
                  <div key={category.id} className="space-y-2">
                    <h3 className="font-semibold text-md">{category.name}</h3>
                    <p className="text-sm text-gray-500">{category.description}</p>
                    
                    <div className="grid grid-cols-1 gap-2">
                      {category.nodes.map((node) => (
                        <div 
                          key={node.type}
                          className="p-3 bg-gray-50 rounded-md cursor-pointer hover:bg-gray-100"
                          onClick={() => handleAddNode(node.type, category.id, node.name)}
                        >
                          <div className="font-medium">{node.name}</div>
                          <div className="text-xs text-gray-500">{node.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>
        
        {/* Node configuration panel */}
        {selectedNode && (
          <Sheet open={configPanelOpen} onOpenChange={setConfigPanelOpen}>
            <SheetContent side="right" className="w-[400px]">
              <div className="h-full overflow-auto">
                <h2 className="font-bold text-xl mb-4">Node Configuration</h2>
                
                {/* Node config form will go here */}
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold">{selectedNode.data.label}</h3>
                    <p className="text-sm text-gray-500">{selectedNode.data.type}</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={handleNodeDuplicate}
                    >
                      Duplicate
                    </Button>
                    <Button 
                      variant="destructive"
                      onClick={handleNodeDelete}
                    >
                      Delete
                    </Button>
                  </div>
                  
                  {/* Todo: Add specific config UI based on node type */}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
};

export default Canvas;
