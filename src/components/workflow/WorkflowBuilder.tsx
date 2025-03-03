
import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  NodeChange,
  EdgeChange,
  Connection,
  NodeTypes,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import {
  WorkflowNode,
  Edge,
  NodeType,
  WorkflowNodeData,
  NodeComponentType,
} from '@/types/workflow';

import AINode from './nodes/AINode';
import DataInputNode from './nodes/DataInputNode';
import DataProcessingNode from './nodes/DataProcessingNode';
import OutputNode from './nodes/OutputNode';
import AskAINode from './nodes/AskAINode';
import IntegrationNode from './nodes/IntegrationNode';
import ControlNode from './nodes/ControlNode';
import SpreadsheetGeneratorNode from './nodes/SpreadsheetGeneratorNode';
import UtilityNode from './nodes/UtilityNode';
import FileUploadNode from './nodes/FileUploadNode';

import NodeConfigPanel from './NodeConfigPanel';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

// Define the node types for ReactFlow
const nodeTypes: NodeTypes = {
  aiNode: AINode,
  dataInput: DataInputNode,
  dataProcessing: DataProcessingNode,
  outputNode: OutputNode,
  askAI: AskAINode,
  integrationNode: IntegrationNode,
  controlNode: ControlNode,
  spreadsheetGenerator: SpreadsheetGeneratorNode,
  utilityNode: UtilityNode,
  fileUpload: FileUploadNode,
};

interface WorkflowBuilderProps {
  initialNodes?: WorkflowNode[];
  initialEdges?: Edge[];
  onChange?: (nodes: WorkflowNode[], edges: Edge[]) => void;
  onSave?: (nodes: WorkflowNode[], edges: Edge[]) => void;
  readOnly?: boolean;
}

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  initialNodes = [],
  initialEdges = [],
  onChange,
  onSave,
  readOnly = false,
}) => {
  // Use the properly typed useNodesState and useEdgesState hooks
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode[]>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>(initialEdges);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);

  // When nodes or edges change, notify the parent component
  useEffect(() => {
    if (onChange) {
      onChange(nodes, edges);
    }
  }, [nodes, edges, onChange]);

  // Handle node selection
  const onNodeClick = useCallback((event: React.MouseEvent, node: WorkflowNode) => {
    setSelectedNode(node);
    setIsConfigPanelOpen(true);
  }, []);

  // Handle edge connections
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  // Update node configuration
  const handleUpdateNodeConfig = useCallback(
    (updatedConfig: any) => {
      if (!selectedNode) return;
      
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === selectedNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                config: updatedConfig,
              },
            };
          }
          return node;
        })
      );
    },
    [selectedNode, setNodes]
  );

  // Delete a node
  const handleDeleteNode = useCallback(() => {
    if (!selectedNode) return;
    
    setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter(
        (edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id
      )
    );
    
    setSelectedNode(null);
    setIsConfigPanelOpen(false);
  }, [selectedNode, setNodes, setEdges]);

  // Duplicate a node
  const handleDuplicateNode = useCallback(() => {
    if (!selectedNode) return;
    
    const newNodeId = `node-${uuidv4()}`;
    const newNode: WorkflowNode = {
      ...selectedNode,
      id: newNodeId,
      position: {
        x: selectedNode.position.x + 50,
        y: selectedNode.position.y + 50,
      },
    };
    
    setNodes((nds) => [...nds, newNode]);
  }, [selectedNode, setNodes]);

  // Add a new node to the workflow
  const addNode = (type: NodeComponentType) => {
    const nodeId = `node-${uuidv4()}`;
    
    // Create node data with correct type based on the component type
    let nodeData: WorkflowNodeData;
    
    switch (type) {
      case 'fileUpload':
        nodeData = {
          label: 'File Upload',
          type: 'fileUpload' as const,
          config: {},
        };
        break;
      case 'spreadsheetGenerator':
        nodeData = {
          label: 'Spreadsheet Generator',
          type: 'spreadsheetGenerator' as const,
          config: {},
        };
        break;
      case 'dataInput':
        nodeData = {
          label: 'Data Input',
          type: 'dataInput' as const,
          config: {},
        };
        break;
      case 'dataProcessing':
        nodeData = {
          label: 'Data Processing',
          type: 'dataProcessing' as const,
          config: {},
        };
        break;
      case 'aiNode':
        nodeData = {
          label: 'AI Analysis',
          type: 'aiNode' as const,
          config: {},
        };
        break;
      case 'askAI':
        nodeData = {
          label: 'Ask AI',
          type: 'askAI' as const,
          config: {},
        };
        break;
      case 'outputNode':
        nodeData = {
          label: 'Output',
          type: 'outputNode' as const,
          config: {},
        };
        break;
      case 'integrationNode':
        nodeData = {
          label: 'Integration',
          type: 'integrationNode' as const,
          config: {},
        };
        break;
      case 'controlNode':
        nodeData = {
          label: 'Control Flow',
          type: 'controlNode' as const,
          config: {},
        };
        break;
      case 'utilityNode':
        nodeData = {
          label: 'Utility',
          type: 'utilityNode' as const,
          config: {},
        };
        break;
      default:
        nodeData = {
          label: 'Node',
          type: 'dataInput' as const,
          config: {},
        };
    }
    
    const newNode: WorkflowNode = {
      id: nodeId,
      type,
      position: { x: 100, y: 100 },
      data: nodeData,
    };
    
    setNodes((nds) => [...nds, newNode]);
  };

  return (
    <div className="w-full h-full flex">
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.2}
          maxZoom={4}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          style={{ backgroundColor: "#f7f9fc" }}
        >
          <Background />
          <Controls />
          <MiniMap />
          
          {!readOnly && (
            <Panel position="top-right" className="mt-10">
              <div className="bg-white p-2 rounded shadow-md">
                <Button
                  size="sm"
                  onClick={() => addNode('dataInput')}
                  className="mb-2 w-full"
                >
                  <Plus className="mr-1 h-4 w-4" /> Data Input
                </Button>
                <Button
                  size="sm"
                  onClick={() => addNode('dataProcessing')}
                  className="mb-2 w-full"
                >
                  <Plus className="mr-1 h-4 w-4" /> Processing
                </Button>
                <Button
                  size="sm"
                  onClick={() => addNode('aiNode')}
                  className="mb-2 w-full"
                >
                  <Plus className="mr-1 h-4 w-4" /> AI Node
                </Button>
                <Button
                  size="sm"
                  onClick={() => addNode('outputNode')}
                  className="w-full"
                >
                  <Plus className="mr-1 h-4 w-4" /> Output
                </Button>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {isConfigPanelOpen && selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onUpdateConfig={handleUpdateNodeConfig}
          onDelete={handleDeleteNode}
          onDuplicate={handleDuplicateNode}
          onClose={() => {
            setIsConfigPanelOpen(false);
            setSelectedNode(null);
          }}
          readOnly={readOnly}
        />
      )}
    </div>
  );
};

export default WorkflowBuilder;
