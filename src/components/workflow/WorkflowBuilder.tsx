import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  ReactFlowProvider,
  Panel,
  useReactFlow,
  MiniMap,
  NodeTypes,
  NodeMouseHandler,
  EdgeMouseHandler,
  Connection,
  useStoreApi,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges
} from '@xyflow/react';
import AINode from './nodes/AINode';
import DataInputNode from './nodes/DataInputNode';
import DataProcessingNode from './nodes/DataProcessingNode';
import OutputNode from './nodes/OutputNode';
import IntegrationNode from './nodes/IntegrationNode';
import ControlNode from './nodes/ControlNode';
import SpreadsheetGeneratorNode from './nodes/SpreadsheetGeneratorNode';
import NodeLibrary from './NodeLibrary';
import { Button } from '@/components/ui/button';
import { Plus, Save, Play, Undo, Redo, ZoomIn, ZoomOut, Download, Share, ArrowUpDown, Columns, X } from 'lucide-react';
import NodeConfigPanel from './NodeConfigPanel';
import { v4 as uuidv4 } from 'uuid';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/hooks/use-media-query';
import { supabase } from '@/integrations/supabase/client';
import {
  WorkflowNodeData,
  WorkflowNode,
  SpreadsheetGeneratorNodeData,
  NodeDragHandler,
  NodeLibraryProps
} from '@/types/workflow';

// Set custom node types
const nodeTypes: NodeTypes = {
  dataInput: DataInputNode,
  dataProcessing: DataProcessingNode,
  aiNode: AINode,
  outputNode: OutputNode,
  integrationNode: IntegrationNode,
  controlNode: ControlNode,
  spreadsheetGenerator: SpreadsheetGeneratorNode,
};

interface WorkflowBuilderProps {
  initialNodes?: WorkflowNode[];
  initialEdges?: Edge[];
  readOnly?: boolean;
  workflowId?: string;
  workflowName?: string;
  onSave?: (nodes: WorkflowNode[], edges: Edge[]) => Promise<void>;
  onRun?: () => Promise<void>;
}

interface HistoryState {
  nodes: WorkflowNode[];
  edges: Edge[];
}

const Flow: React.FC<WorkflowBuilderProps> = ({
  initialNodes = [],
  initialEdges = [],
  readOnly = false,
  workflowId,
  workflowName,
  onSave,
  onRun
}) => {
  // Use reactive refs
  const reactFlowInstance = useReactFlow();
  const store = useStoreApi();
  const { toast } = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // State
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([{ nodes: initialNodes, edges: initialEdges }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [saveInProgress, setSaveInProgress] = useState(false);

  // Record history
  const recordHistory = useCallback((nodes: WorkflowNode[], edges: Edge[]) => {
    // Limit history to 50 states
    const newHistory = [...history.slice(0, historyIndex + 1), { nodes, edges }].slice(-50);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Handlers for undoing and redoing
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const state = history[newIndex];
      setNodes(state.nodes);
      setEdges(state.edges);
      setHistoryIndex(newIndex);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const state = history[newIndex];
      setNodes(state.nodes);
      setEdges(state.edges);
      setHistoryIndex(newIndex);
    }
  }, [history, historyIndex]);

  // Handle node changes
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, nodes) as WorkflowNode[];
      setNodes(nextNodes);
      
      // Don't record selection changes in history
      if (!changes.every(change => change.type === 'select')) {
        recordHistory(nextNodes, edges);
      }
    },
    [nodes, edges, recordHistory]
  );

  // Handle edge changes
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      setEdges(nextEdges);
      
      // Don't record selection changes in history
      if (!changes.every(change => change.type === 'select')) {
        recordHistory(nodes, nextEdges);
      }
    },
    [nodes, edges, recordHistory]
  );

  // Handle connecting nodes
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // Make sure connection has source and target
      if (!connection.source || !connection.target) return;

      const newEdge: Edge = {
        id: `e-${connection.source}-${connection.target}`,
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
        type: 'smoothstep',
        animated: true,
      };

      const newEdges = [...edges, newEdge];
      setEdges(newEdges);
      recordHistory(nodes, newEdges);
    },
    [nodes, edges, recordHistory]
  );

  // Handle drag start
  const onNodeDragStart: NodeDragHandler = useCallback(() => {
    setIsDragging(true);
  }, []);

  // Handle drag stop
  const onNodeDragStop: NodeDragHandler = useCallback(() => {
    setIsDragging(false);
    recordHistory(nodes, edges);
  }, [nodes, edges, recordHistory]);

  // Handle node selection
  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (readOnly) return;
    // Cast to WorkflowNode since we know our nodes are of that type
    setSelectedNode(node as WorkflowNode);
    setConfigPanelOpen(true);
  }, [readOnly]);

  // Handle node deletion
  const handleNodeDelete = useCallback(() => {
    if (!selectedNode) return;

    const newNodes = nodes.filter(n => n.id !== selectedNode.id);
    const newEdges = edges.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id);
    
    setNodes(newNodes);
    setEdges(newEdges);
    setSelectedNode(null);
    setConfigPanelOpen(false);
    
    recordHistory(newNodes, newEdges);
  }, [selectedNode, nodes, edges, recordHistory]);

  // Handle node duplication
  const handleNodeDuplicate = useCallback(() => {
    if (!selectedNode) return;

    const nodeData = selectedNode.data;
    const newNodeId = `node-${uuidv4()}`;
    const newNode: WorkflowNode = {
      ...selectedNode,
      id: newNodeId,
      position: { 
        x: selectedNode.position.x + 50, 
        y: selectedNode.position.y + 50 
      },
      selected: false,
      data: { ...nodeData }
    };

    const newNodes = [...nodes, newNode];
    setNodes(newNodes);
    recordHistory(newNodes, edges);
    
    // Select the new node
    setSelectedNode(newNode);
  }, [selectedNode, nodes, edges, recordHistory]);

  // Handle config updates
  const handleConfigUpdate = useCallback((updatedNodeData: Partial<WorkflowNodeData>) => {
    if (!selectedNode) return;
    
    const updatedNodes = nodes.map(n => {
      if (n.id === selectedNode.id) {
        return {
          ...n,
          data: {
            ...n.data,
            ...updatedNodeData
          }
        };
      }
      return n;
    });
    
    setNodes(updatedNodes);
    recordHistory(updatedNodes, edges);
    
    // Update selectedNode reference
    const updatedSelectedNode = updatedNodes.find(n => n.id === selectedNode.id);
    if (updatedSelectedNode) {
      setSelectedNode(updatedSelectedNode);
    }
  }, [selectedNode, nodes, edges, recordHistory]);

  // Save the workflow
  const saveWorkflow = useCallback(async () => {
    if (!workflowId || !onSave) return;
    
    try {
      setSaveInProgress(true);
      await onSave(nodes, edges);
      toast({
        title: "Success",
        description: "Workflow saved successfully",
      });
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast({
        title: "Error",
        description: "Failed to save workflow",
        variant: "destructive",
      });
    } finally {
      setSaveInProgress(false);
    }
  }, [workflowId, nodes, edges, onSave, toast]);

  // Run the workflow
  const runWorkflow = useCallback(async () => {
    if (!onRun) return;
    
    try {
      await onRun();
      toast({
        title: "Success",
        description: "Workflow execution started",
      });
    } catch (error) {
      console.error('Error running workflow:', error);
      toast({
        title: "Error",
        description: "Failed to run workflow",
        variant: "destructive",
      });
    }
  }, [onRun, toast]);

  // Handle drag over (for dropping nodes)
  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle drop (for dropping nodes)
  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (readOnly) return;

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const nodeType = event.dataTransfer.getData('application/reactflow/type');
      const nodeCategory = event.dataTransfer.getData('application/reactflow/category');
      const nodeLabel = event.dataTransfer.getData('application/reactflow/label');

      // Check if node type was passed
      if (!nodeType) return;

      // Get the position where the node should be placed
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top
      });

      // Create a unique ID
      const newNodeId = `node-${uuidv4()}`;

      // Map node type to node data
      let nodeData: WorkflowNodeData;
      
      switch (nodeCategory) {
        case 'input':
          nodeData = {
            type: nodeType as any,
            label: nodeLabel || 'Input',
            config: {}
          };
          break;
        case 'processing':
          nodeData = {
            type: nodeType as any,
            label: nodeLabel || 'Process',
            config: {}
          };
          break;
        case 'ai':
          nodeData = {
            type: nodeType as any,
            label: nodeLabel || 'AI',
            config: {}
          };
          break;
        case 'output':
          nodeData = {
            type: nodeType as any,
            label: nodeLabel || 'Output',
            config: {}
          };
          break;
        case 'integration':
          nodeData = {
            type: nodeType as any,
            label: nodeLabel || 'Integration',
            config: {}
          };
          break;
        case 'control':
          nodeData = {
            type: nodeType as any,
            label: nodeLabel || 'Control',
            config: {}
          };
          break;
        case 'spreadsheet':
          nodeData = {
            type: 'spreadsheetGenerator',
            label: nodeLabel || 'Spreadsheet',
            config: {
              filename: 'output.xlsx',
              sheets: []
            }
          } as SpreadsheetGeneratorNodeData;
          break;
        default:
          nodeData = {
            type: nodeType as any,
            label: nodeLabel || 'Node',
            config: {}
          };
      }

      // Create the new node
      const newNode: WorkflowNode = {
        id: newNodeId,
        position,
        type: getCategoryNodeType(nodeCategory),
        data: nodeData
      };

      // Add the node to the graph
      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      recordHistory(newNodes, edges);
    },
    [reactFlowInstance, nodes, edges, readOnly, recordHistory]
  );

  // Map node category to node type
  const getCategoryNodeType = (category: string): string => {
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

  // Create a new empty workflow
  const createNewWorkflow = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setHistory([{ nodes: [], edges: [] }]);
    setHistoryIndex(0);
  }, []);

  // Fix the NodeLibrary component props
  const libraryProps: NodeLibraryProps = {
    isOpen: libraryOpen,
    onClose: () => setLibraryOpen(false),
    onAddNode: (nodeType, nodeCategory, nodeLabel) => {
      // Implementation for adding nodes
      // This would be called from the NodeLibrary component
    },
    nodeCategories: [
      {
        id: 'input',
        name: 'Data Input',
        items: [
          { type: 'excelInput', label: 'Excel Input', icon: 'file-spreadsheet' },
          { type: 'csvInput', label: 'CSV Input', icon: 'file-text' },
          { type: 'apiSource', label: 'API Source', icon: 'api' },
          { type: 'userInput', label: 'User Input', icon: 'user' }
        ]
      },
      {
        id: 'processing',
        name: 'Data Processing',
        items: [
          { type: 'dataTransform', label: 'Transform', icon: 'transform' },
          { type: 'dataCleaning', label: 'Clean Data', icon: 'filter' },
          { type: 'formulaNode', label: 'Formula', icon: 'function-square' },
          { type: 'filterNode', label: 'Filter', icon: 'filter' }
        ]
      },
      {
        id: 'ai',
        name: 'AI & Analysis',
        items: [
          { type: 'aiAnalyze', label: 'AI Analyze', icon: 'brain' },
          { type: 'aiClassify', label: 'AI Classify', icon: 'layers' },
          { type: 'aiSummarize', label: 'AI Summarize', icon: 'list-checks' }
        ]
      },
      {
        id: 'output',
        name: 'Output & Visualization',
        items: [
          { type: 'excelOutput', label: 'Excel Output', icon: 'file-spreadsheet' },
          { type: 'dashboardOutput', label: 'Dashboard', icon: 'layout-dashboard' },
          { type: 'emailNotify', label: 'Email Notification', icon: 'mail' }
        ]
      }
    ]
  };

  return (
    <div className="flex h-full w-full" ref={reactFlowWrapper}>
      <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
        <SheetContent side={isMobile ? "bottom" : "left"} className={isMobile ? "h-[80vh]" : ""}>
          <NodeLibrary {...libraryProps} />
        </SheetContent>
      </Sheet>

      <div className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          fitView
          snapToGrid={true}
          snapGrid={[15, 15]}
          connectionLineStyle={{ stroke: '#888', strokeWidth: 2 }}
          defaultEdgeOptions={{
            style: { stroke: '#888', strokeWidth: 2 },
            type: 'smoothstep',
            animated: true
          }}
          proOptions={{ hideAttribution: true }}
          className="bg-gray-50"
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              switch (n.type) {
                case 'dataInput': return '#c6e6f8';
                case 'dataProcessing': return '#d4f8c6';
                case 'aiNode': return '#f8e6c6';
                case 'outputNode': return '#f8c6c6';
                case 'integrationNode': return '#e6c6f8';
                case 'controlNode': return '#c6f8e6';
                case 'spreadsheetGenerator': return '#f8f8c6';
                default: return '#c6c6c6';
              }
            }}
            className="bg-white border border-gray-200 shadow-sm"
          />
          <Panel position="top-center" className="bg-white rounded-lg shadow-md border border-gray-200 px-4 py-2 flex gap-2 items-center">
            <h2 className="font-bold text-lg mr-4">{workflowName || "Untitled Workflow"}</h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setLibraryOpen(true)} 
                    disabled={readOnly}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Node
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add new nodes</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={undo}
                    disabled={historyIndex <= 0}
                  >
                    <Undo className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1}
                  >
                    <Redo className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveWorkflow}
                    disabled={readOnly || saveInProgress}
                  >
                    <Save className="h-4 w-4 mr-1" /> Save
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save workflow</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={runWorkflow}
                    disabled={!nodes.length}
                  >
                    <Play className="h-4 w-4 mr-1" /> Run
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Run workflow</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Panel>
        </ReactFlow>
      </div>

      {selectedNode && (
        <div className={`absolute right-0 top-0 h-full transition-transform duration-300 transform ${configPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <NodeConfigPanel
            nodeData={selectedNode.data}
            onUpdateConfig={handleConfigUpdate}
            onDelete={handleNodeDelete}
            onDuplicate={handleNodeDuplicate}
            onClose={() => setConfigPanelOpen(false)}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
};

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = (props) => {
  return (
    <ReactFlowProvider>
      <div className="h-screen w-full">
        <Flow {...props} />
      </div>
    </ReactFlowProvider>
  );
};

export default WorkflowBuilder;
