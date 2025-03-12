
import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  BackgroundVariant,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorkflowDefinition, WorkflowNode } from '@/types/workflow';
import NodeConfigPanel from './NodeConfigPanel';
import NodeLibrary from './NodeLibrary';
import { getNodeTypes } from '@/components/canvas/NodeTypes';

const WorkflowBuilder: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [showNodeLibrary, setShowNodeLibrary] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    // Find the full node data from our nodes array
    const selectedNode = nodes.find(n => n.id === node.id) as WorkflowNode;
    if (selectedNode) {
      setSelectedNode(selectedNode);
    }
  }, [nodes]);
  
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);
  
  const handleUpdateNodeConfig = useCallback((updatedConfig: any) => {
    if (!selectedNode) return;
    
    setNodes(nds => 
      nds.map(node => {
        if (node.id === selectedNode.id) {
          return {
            ...node,
            data: {
              ...node.data,
              config: updatedConfig
            }
          };
        }
        return node;
      })
    );
  }, [selectedNode, setNodes]);
  
  const handleAddNode = useCallback((nodeType: string, label: string) => {
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'dataInput', // Set a default type that exists in NodeComponentType
      position: { x: 100, y: 100 },
      data: {
        label: label || 'New Node',
        type: nodeType,
        config: {}
      }
    };
    
    setNodes(nds => [...nds, newNode]);
    setShowNodeLibrary(false);
  }, [setNodes]);
  
  return (
    <div className="h-screen flex flex-col">
      <div className="border-b p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Workflow Builder</h1>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowNodeLibrary(true)}
          >
            Add Node
          </Button>
        </div>
      </div>
      
      <div className="flex-1 flex">
        <div 
          className="flex-1 h-full" 
          ref={reactFlowWrapper}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={getNodeTypes()}
            fitView
            attributionPosition="top-right"
          >
            <Background variant={BackgroundVariant.Dots} />
            <Controls />
            <MiniMap />
            <Panel position="top-right" className="bg-white p-2 rounded shadow-sm">
              <Button 
                size="sm" 
                onClick={() => setShowNodeLibrary(true)}
              >
                Add Node
              </Button>
            </Panel>
          </ReactFlow>
        </div>
        
        {selectedNode && (
          <div className="w-96 border-l">
            <NodeConfigPanel
              node={selectedNode}
              onConfigChange={handleUpdateNodeConfig}
              onClose={() => setSelectedNode(null)}
            />
          </div>
        )}
      </div>
      
      <NodeLibrary
        isOpen={showNodeLibrary}
        onClose={() => setShowNodeLibrary(false)}
        onAddNode={handleAddNode}
      />
    </div>
  );
};

export default WorkflowBuilder;
