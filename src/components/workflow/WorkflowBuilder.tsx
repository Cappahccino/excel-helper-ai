// src/components/workflow/WorkflowBuilder.tsx

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  Panel,
  NodeTypes,
  ConnectionLineType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Save, 
  Play, 
  Settings, 
  FilePlus,
  Download,
  Upload,
  Trash2,
  Copy,
  Edit2,
  Zap,
  Database,
  FileSearch,
  FileText,
  Table
} from 'lucide-react';

// Import custom node components
import DataInputNode from '@/components/workflow/nodes/DataInputNode';
import DataProcessingNode from '@/components/workflow/nodes/DataProcessingNode';
import AINode from '@/components/workflow/nodes/AINode';
import OutputNode from '@/components/workflow/nodes/OutputNode';
import IntegrationNode from '@/components/workflow/nodes/IntegrationNode';
import ControlNode from '@/components/workflow/nodes/ControlNode';
import SpreadsheetGeneratorNode from '@/components/workflow/nodes/SpreadsheetGeneratorNode';


// Import node configuration panels
import NodeConfigPanel from '@/components/workflow/NodeConfigPanel';
import NodeLibrary from '@/components/workflow/NodeLibrary';

// Define node categories with their components
const NODE_CATEGORIES = {
  input: {
    label: 'Data Input',
    icon: <Database className="w-4 h-4" />,
    description: 'Nodes for importing data from various sources',
    color: 'bg-blue-100 border-blue-400',
    nodes: ['excelInput', 'csvInput', 'apiSource', 'userInput']
  },
  processing: {
    label: 'Data Processing',
    icon: <Table className="w-4 h-4" />,
    description: 'Nodes for transforming and manipulating data',
    color: 'bg-green-100 border-green-400',
    nodes: ['dataTransform', 'dataCleaning', 'formulaNode', 'filterNode']
  },
  ai: {
    label: 'AI',
    icon: <Zap className="w-4 h-4" />,
    description: 'Nodes for AI-powered analysis and automation',
    color: 'bg-purple-100 border-purple-400',
    nodes: ['aiAnalyze', 'aiClassify', 'aiSummarize']
  },
  integration: {
    label: 'Integrations',
    icon: <FileSearch className="w-4 h-4" />,
    description: 'Nodes for connecting to external services',
    color: 'bg-orange-100 border-orange-400',
    nodes: ['xeroConnect', 'salesforceConnect', 'googleSheetsConnect']
  },
  output: {
    label: 'Output',
    icon: <FileText className="w-4 h-4" />,
    description: 'Nodes for exporting and visualizing results',
    color: 'bg-red-100 border-red-400',
    nodes: ['excelOutput', 'dashboardOutput', 'emailNotify']
  },
  control: {
    label: 'Control Flow',
    icon: <Edit2 className="w-4 h-4" />,
    description: 'Nodes for controlling workflow execution',
    color: 'bg-gray-100 border-gray-400',
    nodes: ['conditionalBranch', 'loopNode', 'mergeNode']
  }
};

// Register custom node components
const nodeTypes: NodeTypes = {
  dataInput: DataInputNode,
  dataProcessing: DataProcessingNode,
  ai: AINode,
  output: OutputNode,
  integration: IntegrationNode,
  control: ControlNode,
};

// Map node types to their visual categories
const NODE_TYPE_CATEGORY_MAP: Record<string, string> = {
  excelInput: 'input',
  csvInput: 'input',
  apiSource: 'input',
  userInput: 'input',
  
  dataTransform: 'processing',
  dataCleaning: 'processing',
  formulaNode: 'processing',
  filterNode: 'processing',
  spreadsheetGenerator: 'processing',
  
  aiAnalyze: 'ai',
  aiClassify: 'ai',
  aiSummarize: 'ai',
  
  xeroConnect: 'integration',
  salesforceConnect: 'integration',
  googleSheetsConnect: 'integration',
  
  excelOutput: 'output',
  dashboardOutput: 'output',
  emailNotify: 'output',
  
  conditionalBranch: 'control',
  loopNode: 'control',
  mergeNode: 'control',
};

// Default configs for each node type
const DEFAULT_NODE_CONFIGS: Record<string, any> = {
  excelInput: {
    fileId: null,
    hasHeaders: true,
  },
  aiAnalyze: {
    operation: 'analyze',
    analysisOptions: {
      detectOutliers: true,
      findPatterns: true
    }
  },
  spreadsheetGenerator: {
    filename: 'generated-spreadsheet.xlsx',
    sheets: [
      {
        name: 'Sheet1',
        includeHeaders: true
      }
    ],
    format: 'xlsx'
  },
  // Add defaults for other node types
};

interface WorkflowBuilderProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onSave?: (nodes: Node[], edges: Edge[]) => void;
  onRun?: (workflowId: string) => void;
  readOnly?: boolean;
}

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  initialNodes = [],
  initialEdges = [],
  onSave,
  onRun,
  readOnly = false
}) => {
  // Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  // UI state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isNodeLibraryOpen, setIsNodeLibraryOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  
  // Refs
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  // Handle node selection
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setIsPanelOpen(true);
  }, []);
  
  // Handle edge connections
  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({
      ...connection,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#27B67A', strokeWidth: 2 }
    }, eds));
  }, [setEdges]);
  
  // Handle dropping nodes onto the canvas
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    
    const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!reactFlowBounds) return;
    
    const nodeType = event.dataTransfer.getData('application/reactflow/type');
    const nodeCategory = NODE_TYPE_CATEGORY_MAP[nodeType] || 'processing';
    
    if (!nodeType) return;
    
    // Get the position from the drop event
    const position = {
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top
    };
    
    // Generate a unique ID for the new node
    const id = `${nodeType}_${uuidv4()}`;
    
    // Create the new node
    const newNode = {
      id,
      type: nodeCategory,
      position,
      data: {
        label: getNodeLabel(nodeType),
        type: nodeType,
        config: DEFAULT_NODE_CONFIGS[nodeType] || {},
      },
      dragHandle: '.drag-handle',
    };
    
    setNodes((nds) => [...nds, newNode]);
    
    // Select the new node for immediate configuration
    setSelectedNode(newNode);
    setIsPanelOpen(true);
  }, [setNodes]);
  
  // Handle drag over for dropping nodes
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  
  // Save the workflow
  const handleSaveWorkflow = useCallback(() => {
    if (onSave) {
      onSave(nodes, edges);
    }
    
    toast({
      title: 'Workflow Saved',
      description: `${workflowName} has been saved successfully.`
    });
  }, [nodes, edges, onSave, workflowName]);
  
  // Run the workflow
  const handleRunWorkflow = useCallback(() => {
    setIsRunning(true);
    
    // Generate a workflow ID for this run
    const workflowId = uuidv4();
    
    if (onRun) {
      onRun(workflowId);
    } else {
      // If no onRun callback, simulate a run
      setTimeout(() => {
        setIsRunning(false);
        toast({
          title: 'Workflow Completed',
          description: `${workflowName} has finished running.`
        });
      }, 2000);
    }
  }, [onRun, workflowName]);
  
  // Update node configuration
  const handleUpdateNodeConfig = useCallback((nodeId: string, config: any) => {
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              config
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);
  
  // Add a node from the library
  const handleAddNode = useCallback((nodeType: string) => {
    const nodeCategory = NODE_TYPE_CATEGORY_MAP[nodeType] || 'processing';
    
    // Find a position for the new node
    // For simplicity, place it in the center of the viewport
    const position = { x: 100, y: 100 };
    
    // Generate a unique ID for the new node
    const id = `${nodeType}_${uuidv4()}`;
    
    // Create the new node
    const newNode = {
      id,
      type: nodeCategory,
      position,
      data: {
        label: getNodeLabel(nodeType),
        type: nodeType,
        config: DEFAULT_NODE_CONFIGS[nodeType] || {},
      },
      dragHandle: '.drag-handle',
    };
    
    setNodes((nds) => [...nds, newNode]);
    setIsNodeLibraryOpen(false);
    
    // Select the new node for immediate configuration
    setSelectedNode(newNode);
    setIsPanelOpen(true);
  }, [setNodes]);
  
  // Delete a node
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => 
      edge.source !== nodeId && edge.target !== nodeId
    ));
    
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
      setIsPanelOpen(false);
    }
  }, [setNodes, setEdges, selectedNode]);
  
  // Duplicate a node
  const handleDuplicateNode = useCallback((nodeId: string) => {
    const nodeToDuplicate = nodes.find((node) => node.id === nodeId);
    
    if (nodeToDuplicate) {
      const id = `${nodeToDuplicate.data.type}_${uuidv4()}`;
      
      const newNode = {
        ...nodeToDuplicate,
        id,
        position: {
          x: nodeToDuplicate.position.x + 50,
          y: nodeToDuplicate.position.y + 50
        }
      };
      
      setNodes((nds) => [...nds, newNode]);
    }
  }, [nodes, setNodes]);
  
  // Export workflow as JSON
  const handleExportWorkflow = useCallback(() => {
    const workflowData = {
      name: workflowName,
      description: workflowDescription,
      nodes,
      edges
    };
    
    const jsonString = JSON.stringify(workflowData, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`;
    
    const downloadLink = document.createElement('a');
    downloadLink.href = dataUri;
    downloadLink.download = `${workflowName.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, [workflowName, workflowDescription, nodes, edges]);
  
  // Import workflow from JSON
  const handleImportWorkflow = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workflowData = JSON.parse(e.target?.result as string);
        
        if (workflowData.nodes && workflowData.edges) {
          setNodes(workflowData.nodes);
          setEdges(workflowData.edges);
          
          if (workflowData.name) {
            setWorkflowName(workflowData.name);
          }
          
          if (workflowData.description) {
            setWorkflowDescription(workflowData.description);
          }
          
          toast({
            title: 'Workflow Imported',
            description: `${workflowData.name || 'Workflow'} has been imported successfully.`
          });
        } else {
          throw new Error('Invalid workflow data');
        }
      } catch (error) {
        toast({
          title: 'Import Failed',
          description: 'The selected file is not a valid workflow.',
          variant: 'destructive'
        });
      }
    };
    
    reader.readAsText(file);
    
    // Reset the input value to allow importing the same file again
    event.target.value = '';
  }, [setNodes, setEdges]);
  
  // Helper function to get a readable label for a node type
  function getNodeLabel(nodeType: string): string {
    const labels: Record<string, string> = {
      excelInput: 'Excel Input',
      csvInput: 'CSV Input',
      apiSource: 'API Source',
      userInput: 'User Input',
      dataTransform: 'Transform Data',
      dataCleaning: 'Clean Data',
      formulaNode: 'Apply Formula',
      filterNode: 'Filter Data',
      aiAnalyze: 'AI Analysis',
      aiClassify: 'AI Classification',
      aiSummarize: 'AI Summary',
      xeroConnect: 'Xero Integration',
      salesforceConnect: 'Salesforce',
      googleSheetsConnect: 'Google Sheets',
      excelOutput: 'Excel Output',
      dashboardOutput: 'Dashboard',
      emailNotify: 'Email Notification',
      conditionalBranch: 'Condition',
      loopNode: 'Loop',
      mergeNode: 'Merge',
    };
    
    return labels[nodeType] || nodeType;
  }
  
  return (
    <div className="h-full w-full flex flex-col">
      {/* Header toolbar */}
      <div className="bg-white/80 backdrop-blur-sm border-b p-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-xl font-semibold bg-transparent border-none focus:outline-none focus:ring-0"
            disabled={readOnly}
          />
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsNodeLibraryOpen(true)}
              disabled={readOnly}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Node
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveWorkflow}
              disabled={readOnly || nodes.length === 0}
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            
            <Button
              variant={isRunning ? "secondary" : "ghost"}
              size="sm"
              onClick={handleRunWorkflow}
              disabled={readOnly || isRunning || nodes.length === 0}
            >
              {isRunning ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-b-2 border-current"></div>
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run
                </>
              )}
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="file"
            id="import-workflow"
            className="hidden"
            accept=".json"
            onChange={handleImportWorkflow}
            disabled={readOnly}
          />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => document.getElementById('import-workflow')?.click()}
            disabled={readOnly}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportWorkflow}
            disabled={nodes.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPanelOpen((prev) => !prev)}
            disabled={!selectedNode}
          >
            <Settings className="h-4 w-4 mr-2" />
            Configure
          </Button>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 flex">
        {/* Flow canvas */}
        <div ref={reactFlowWrapper} className="flex-1 h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: '#27B67A' },
              animated: true,
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            connectionLineStyle={{ stroke: '#27B67A' }}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            snapToGrid
            snapGrid={[10, 10]}
          >
            <Controls showInteractive={false} />
            <MiniMap nodeBorderRadius={8} />
            <Background size={1} gap={16} color="#f0f0f0" />
            
            <Panel position="top-center">
              {nodes.length === 0 && (
                <div className="bg-white/80 backdrop-blur-sm mt-8 px-6 py-4 rounded-lg shadow-sm border border-gray-100 text-center">
                  <h3 className="font-medium text-gray-800 mb-1">Build Your Workflow</h3>
                  <p className="text-sm text-gray-600 mb-3">Drag and drop nodes to create your workflow</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsNodeLibraryOpen(true)}
                    disabled={readOnly}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Node
                  </Button>
                </div>
              )}
            </Panel>
          </ReactFlow>
        </div>
        
        {/* Side panel - Node configuration */}
        {isPanelOpen && selectedNode && (
          <div className="w-80 border-l border-gray-100 bg-white overflow-y-auto transition-all">
            <NodeConfigPanel
              node={selectedNode}
              onUpdateConfig={(config) => handleUpdateNodeConfig(selectedNode.id, config)}
              onDelete={() => handleDeleteNode(selectedNode.id)}
              onDuplicate={() => handleDuplicateNode(selectedNode.id)}
              onClose={() => setIsPanelOpen(false)}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>
      
      {/* Node Library Modal */}
      <NodeLibrary
        isOpen={isNodeLibraryOpen}
        onClose={() => setIsNodeLibraryOpen(false)}
        onAddNode={handleAddNode}
        nodeCategories={NODE_CATEGORIES}
      />
    </div>
  );
};

export default WorkflowBuilder;
