
import React, { useCallback, useState, useRef, useMemo } from 'react';
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
  const lastNodeClickTimeRef = useRef<number>(0);
  const lastNodeIdRef = useRef<string | null>(null);
  const selectionLockRef = useRef<boolean>(false);

  // Node click handler with improved throttling and selection stability
  const handleNodeClick = useMemo(() => 
    throttle((event: React.MouseEvent, node: Node) => {
      // Don't handle clicks if selection is locked
      if (selectionLockRef.current) {
        event.stopPropagation();
        return;
      }
      
      // Skip if this is the same node clicked within 250ms
      const now = Date.now();
      if (now - lastNodeClickTimeRef.current < 250 && lastNodeIdRef.current === node.id) {
        event.stopPropagation();
        return;
      }
      
      // Update tracking refs
      lastNodeClickTimeRef.current = now;
      lastNodeIdRef.current = node.id;
      
      // Only handle the click if it's directly on the node, not on child elements
      // that might have their own click handlers (like dropdowns)
      if (event.currentTarget === event.target || 
         (event.target as HTMLElement).getAttribute('data-no-capture') !== 'true') {
        // Temporarily lock selection to prevent race conditions
        selectionLockRef.current = true;
        
        try {
          // Call the original handler
          onNodeClick(event, node);
        } catch (error) {
          console.error("Error in node click handler:", error);
        }
        
        // Unlock selection after a short delay
        setTimeout(() => {
          selectionLockRef.current = false;
        }, 150);
      }
    }, 150, { leading: true, trailing: false }),
    [onNodeClick]
  );

  // Memoize node types to prevent re-renders
  const memoizedNodeTypes = useMemo(() => 
    getNodeTypes(handleNodeConfigUpdate, workflowId), 
    [handleNodeConfigUpdate, workflowId]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={handleNodeClick}
      nodeTypes={memoizedNodeTypes}
      fitView
      attributionPosition="top-right"
      style={{ backgroundColor: "#F7F9FB" }}
      // Additional settings for better selection behavior
      selectNodesOnDrag={false}
      minZoom={0.2}
      maxZoom={4}
      nodesDraggable={true}
      elementsSelectable={true}
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
