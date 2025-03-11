import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
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
  InputNodeType,
  ProcessingNodeType,
  AINodeType,
  OutputNodeType,
  IntegrationNodeType,
  ControlNodeType,
  UtilityNodeType
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
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);

  useEffect(() => {
    if (onChange) {
      onChange(nodes, edges);
    }
  }, [nodes, edges, onChange]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: WorkflowNode) => {
    setSelectedNode(node);
    setIsConfigPanelOpen(true);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

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

  const addNode = (type: NodeComponentType) => {
    const nodeId = `node-${uuidv4()}`;
    
    const createNodeData = (): WorkflowNodeData => {
      switch (type) {
        case 'fileUpload':
          return {
            label: 'File Upload',
            type: 'fileUpload' as const,
            config: {},
          };
        case 'spreadsheetGenerator':
          return {
            label: 'Spreadsheet Generator',
            type: 'spreadsheetGenerator' as const,
            config: {},
          };
        case 'dataInput':
          return {
            label: 'Data Input',
            type: 'dataInput' as InputNodeType,
            config: {},
          };
        case 'dataProcessing':
          return {
            label: 'Data Processing',
            type: 'dataProcessing' as ProcessingNodeType,
            config: {},
          };
        case 'aiNode':
          return {
            label: 'AI Analysis',
            type: 'aiNode' as AINodeType,
            config: {},
          };
        case 'askAI':
          return {
            label: 'Ask AI',
            type: 'askAI' as AINodeType,
            config: {
              aiProvider: 'openai',
              modelName: 'gpt-4o-mini',
              prompt: '',
              systemMessage: '',
            },
          };
        case 'outputNode':
          return {
            label: 'Output',
            type: 'outputNode' as OutputNodeType,
            config: {},
          };
        case 'integrationNode':
          return {
            label: 'Integration',
            type: 'integrationNode' as IntegrationNodeType,
            config: {},
          };
        case 'controlNode':
          return {
            label: 'Control Flow',
            type: 'controlNode' as ControlNodeType,
            config: {},
          };
        case 'utilityNode':
          return {
            label: 'Utility',
            type: 'utilityNode' as UtilityNodeType,
            config: {},
          };
        default:
          return {
            label: 'Node',
            type: 'dataInput' as InputNodeType,
            config: {},
          };
      }
    };
    
    const newNode: WorkflowNode = {
      id: nodeId,
      type,
      position: { x: 100, y: 100 },
      data: createNodeData(),
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

      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onConfigChange={handleNodeConfigUpdate}
          onUpdateConfig={handleNodeConfigUpdate}
          onDelete={() => handleDeleteNode(selectedNode.id)}
          onDuplicate={() => handleDuplicateNode(selectedNode.id)}
          onClose={() => setSelectedNode(null)}
          readOnly={false}
        />
      )}
    </div>
  );
};

export default WorkflowBuilder;
