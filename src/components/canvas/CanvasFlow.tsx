
import React, { useCallback, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Panel, Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Plus, FileText } from 'lucide-react';
import ConnectionHandler from '@/components/workflow/ConnectionHandler';
import { getNodeTypes } from './NodeTypes';
import WorkflowLogPanel from '@/components/workflow/WorkflowLogPanel';
import { throttle } from '@/utils/stableBatchedUpdates';

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
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const [lastNodeClickTime, setLastNodeClickTime] = useState(0);

  // Node click handler with throttling to prevent flickering
  const handleNodeClick = useCallback(
    throttle((event: React.MouseEvent, node: Node) => {
      // Skip if this is the same node clicked within 100ms
      const now = Date.now();
      if (now - lastNodeClickTime < 100 && event.currentTarget.getAttribute('data-id') === node.id) {
        return;
      }
      setLastNodeClickTime(now);
      
      // Only handle the click if it's directly on the node, not on child elements
      // that might have their own click handlers (like dropdowns)
      if (event.currentTarget === event.target || 
         (event.target as HTMLElement).getAttribute('data-no-capture') !== 'true') {
        onNodeClick(event, node);
      }
    }, 50),
    [onNodeClick, lastNodeClickTime]
  );

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
            <Button
              variant="outline"
              className="flex items-center"
              onClick={() => setIsLogDialogOpen(true)}
            >
              <FileText className="mr-2 h-4 w-4" />
              View Logs
            </Button>
          )}
        </div>
      </Panel>

      {executionId && (
        <WorkflowLogPanel
          workflowId={workflowId}
          executionId={executionId}
          isOpen={isLogDialogOpen}
          onOpenChange={setIsLogDialogOpen}
        />
      )}
    </ReactFlow>
  );
};

export default React.memo(CanvasFlow);
