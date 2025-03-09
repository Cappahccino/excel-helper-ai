
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface WorkflowSettingsProps {
  executionStatus: string | null;
  savingWorkflowId: string | null;
  executionId: string | null;
  nodesCount: number;
  edgesCount: number;
}

const WorkflowSettings: React.FC<WorkflowSettingsProps> = ({
  executionStatus,
  savingWorkflowId,
  executionId,
  nodesCount,
  edgesCount
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Settings</CardTitle>
      </CardHeader>
      <CardContent>
        {executionStatus && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2">Execution Status</h3>
            <div className={`px-3 py-2 rounded ${
              executionStatus === 'completed' ? 'bg-green-100 text-green-800' :
              executionStatus === 'failed' ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {executionStatus === 'completed' ? 'Workflow completed successfully' :
               executionStatus === 'failed' ? 'Workflow execution failed' :
               executionStatus === 'pending' ? 'Workflow is queued and waiting to be processed' :
               executionStatus === 'running' ? 'Workflow is currently running...' :
               `Workflow status: ${executionStatus}`}
            </div>
          </div>
        )}
        
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2">Workflow ID</h3>
          <div className="text-sm bg-gray-100 p-2 rounded">
            {savingWorkflowId || 'Not saved yet'}
          </div>
        </div>
        
        {executionId && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2">Current Execution ID</h3>
            <div className="text-sm bg-gray-100 p-2 rounded">
              {executionId}
            </div>
          </div>
        )}
        
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2">Node Count</h3>
          <div className="text-sm">{nodesCount} nodes in this workflow</div>
        </div>
        
        <div>
          <h3 className="text-sm font-semibold mb-2">Edge Count</h3>
          <div className="text-sm">{edgesCount} connections between nodes</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkflowSettings;
