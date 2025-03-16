
import React from 'react';

interface WorkflowIdDisplayProps {
  workflowId: string | null;
}

const WorkflowIdDisplay: React.FC<WorkflowIdDisplayProps> = ({ workflowId }) => {
  if (!workflowId) return null;
  
  // Format the ID to be shorter for display
  const formattedId = workflowId.startsWith('temp-') 
    ? `temp-${workflowId.substring(5, 13)}...` 
    : `${workflowId.substring(0, 8)}...`;
  
  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <p className="text-[9px] text-gray-400 font-mono">
        Workflow: {formattedId}
      </p>
    </div>
  );
};

export default WorkflowIdDisplay;
