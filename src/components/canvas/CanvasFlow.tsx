
import React, { useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Panel, Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Plus, FileText } from 'lucide-react';
import ConnectionHandler from '@/components/workflow/ConnectionHandler';
import { getNodeTypes } from './NodeTypes';

interface CanvasFlowProps {
  nodes: any[];
  edges: any[];
  onNodesChange: any;
  onEdgesChange: any;
  onConnect: any;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  handleNodeConfigUpdate: (nodeId: string, config: any) => void;
  workflowId: string | null;
  executionId: string | null;
  onAddNodeClick: (e: React.MouseEvent) => void;
  showLogPanel: boolean;
  setShowLogPanel: (show: boolean) => void;
}

const CanvasFlow: React.FC<CanvasFlowProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  handleNodeConfigUpdate,
  workflowId,
  executionId,
  onAddNodeClick,
  showLogPanel,
  setShowLogPanel
}) => {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      nodeTypes={getNodeTypes(handleNodeConfigUpdate, workflowId)}
      fitView
      attributionPosition="top-right"
      style={{ backgroundColor: "#F7F9FB" }}
    >
      <ConnectionHandler workflowId={workflowId || undefined} />
      
      <Controls />
      <MiniMap nodeClassName={node => String(node.type)} />
      <Background />
      <Panel position="top-right">
        <Button 
          onClick={onAddNodeClick} 
          className="flex items-center"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Node
        </Button>
        {executionId && (
          <Button
            variant="outline"
            onClick={() => setShowLogPanel(!showLogPanel)}
            className="ml-2 flex items-center"
          >
            <FileText className="mr-2 h-4 w-4" />
            {showLogPanel ? 'Hide Logs' : 'Show Logs'}
          </Button>
        )}
      </Panel>
    </ReactFlow>
  );
};

export default CanvasFlow;
