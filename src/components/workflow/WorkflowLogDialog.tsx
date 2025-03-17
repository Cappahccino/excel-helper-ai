
import React from 'react';
import WorkflowLogPanel from './WorkflowLogPanel';
import { useWorkflow } from './context/WorkflowContext';

interface WorkflowLogDialogProps {
  selectedNodeId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const WorkflowLogDialog: React.FC<WorkflowLogDialogProps> = ({
  selectedNodeId,
  isOpen,
  onOpenChange
}) => {
  const { workflowId, executionId } = useWorkflow();

  return (
    <WorkflowLogPanel
      workflowId={workflowId || null}
      executionId={executionId}
      selectedNodeId={selectedNodeId}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    />
  );
};

export default WorkflowLogDialog;
