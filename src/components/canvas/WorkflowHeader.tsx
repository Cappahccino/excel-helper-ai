
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Save, Play } from 'lucide-react';

interface WorkflowHeaderProps {
  workflowName: string;
  workflowDescription: string;
  onWorkflowNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onWorkflowDescriptionChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSave: () => void;
  onRun: () => void;
  isSaving: boolean;
  isRunning: boolean;
  executionStatus: string | null;
  savingWorkflowId: string | null;
  migrationError: string | null;
  optimisticSave: boolean;
  subscriptionStatus: string | null;
  children?: React.ReactNode; // Add this line to accept children
}

const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({
  workflowName,
  workflowDescription,
  onWorkflowNameChange,
  onWorkflowDescriptionChange,
  onSave,
  onRun,
  isSaving,
  isRunning,
  executionStatus,
  savingWorkflowId,
  migrationError,
  optimisticSave,
  subscriptionStatus,
  children // Add this to destructuring
}) => {
  return (
    <div className="border-b p-4 flex justify-between items-center">
      <div className="flex-1 mr-4">
        <Input
          value={workflowName}
          onChange={onWorkflowNameChange}
          className="text-xl font-bold mb-2"
          placeholder="Workflow Name"
        />
        <Textarea
          value={workflowDescription}
          onChange={onWorkflowDescriptionChange}
          className="text-sm resize-none"
          placeholder="Describe your workflow..."
          rows={2}
        />
      </div>
      <div className="flex space-x-2 items-center">
        {migrationError && (
          <div className="px-3 py-1 text-sm rounded-full bg-yellow-100 text-yellow-800 flex items-center">
            Warning: {migrationError}
          </div>
        )}
        
        {executionStatus && (
          <div className={`px-3 py-1 text-sm rounded-full flex items-center ${
            executionStatus === 'completed' ? 'bg-green-100 text-green-800' :
            executionStatus === 'failed' ? 'bg-red-100 text-red-800' :
            executionStatus === 'running' ? 'bg-blue-100 text-blue-800' :
            executionStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {subscriptionStatus === 'subscribing' && (
              <span className="mr-2 h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
            )}
            {executionStatus === 'completed' ? 'Completed' :
             executionStatus === 'failed' ? 'Failed' :
             executionStatus === 'pending' ? 'Pending' :
             executionStatus === 'running' ? 'Running...' :
             executionStatus}
          </div>
        )}
        
        {savingWorkflowId?.startsWith('temp-') && (
          <div className="px-3 py-1 text-sm rounded-full bg-blue-100 text-blue-800 flex items-center">
            <span className="mr-2 h-2 w-2 rounded-full bg-blue-500"></span>
            Temporary ID
          </div>
        )}
        
        <Button 
          onClick={onSave} 
          disabled={isSaving}
          className={`flex items-center ${optimisticSave ? 'bg-green-500 hover:bg-green-600' : ''}`}
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Saving...' : optimisticSave ? 'Saved!' : 'Save'}
        </Button>
        <Button 
          onClick={onRun} 
          variant="outline"
          disabled={isRunning || executionStatus === 'running'}
          className="flex items-center"
        >
          <Play className="mr-2 h-4 w-4" />
          {isRunning ? 'Starting...' : executionStatus === 'running' ? 'Running...' : 'Run'}
        </Button>
        
        {children} {/* Render children here */}
      </div>
    </div>
  );
};

export default WorkflowHeader;
