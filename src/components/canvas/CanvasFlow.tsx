
import React, { useCallback, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Panel, Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Plus, FileText } from 'lucide-react';
import ConnectionHandler from '@/components/workflow/ConnectionHandler';
import { getNodeTypes } from './NodeTypes';
import WorkflowLogPanel from '@/components/workflow/WorkflowLogPanel';

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
  const [selectedNodeForLogs, setSelectedNodeForLogs] = useState<string | null>(null);

  // Modified node click handler that doesn't open logs panel
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Just pass the click to the parent handler
    onNodeClick(event, node);
  }, [onNodeClick]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={handleNodeClick}
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
        <div className="flex items-center gap-2">
          <Button 
            onClick={onAddNodeClick} 
            className="flex items-center"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Node
          </Button>
          
          {executionId && (
            <WorkflowLogPanel
              workflowId={workflowId}
              executionId={executionId}
              selectedNodeId={selectedNodeForLogs}
              trigger={
                <Button
                  variant="outline"
                  className="flex items-center"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  View Logs
                </Button>
              }
            />
          )}
        </div>
      </Panel>
    </ReactFlow>
  );
};

export default CanvasFlow;
