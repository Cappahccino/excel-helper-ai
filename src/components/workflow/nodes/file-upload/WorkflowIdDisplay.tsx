
import React from 'react';

interface WorkflowIdDisplayProps {
  workflowId: string | null;
}

const WorkflowIdDisplay: React.FC<WorkflowIdDisplayProps> = ({ workflowId }) => {
  if (!workflowId) return null;
  
  return (
    <div className="mt-2 text-[10px] text-gray-400 overflow-hidden text-ellipsis transition-opacity duration-300 hover:text-gray-600 animate-fade-in">
      {workflowId.startsWith('temp-') ? 'Temporary workflow: ' : 'Workflow: '}
      {workflowId.length > 20 ? `${workflowId.substring(0, 20)}...` : workflowId}
    </div>
  );
};

export default WorkflowIdDisplay;
