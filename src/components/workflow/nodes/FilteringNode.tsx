
import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { schemaUtils } from '@/utils/schemaUtils';
import { Card } from '@/components/ui/card';

interface FilteringNodeProps {
  id: string;
  data: {
    label: string;
    config: any;
  };
}

export const FilteringNode: React.FC<FilteringNodeProps> = ({ id, data }) => {
  const { workflowId } = useWorkflow();
  const [schema, setSchema] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    if (!workflowId || !id) return;
    
    const loadSchema = async () => {
      setIsLoading(true);
      try {
        // Use schemaUtils instead of context method
        const nodeSchema = await schemaUtils.getNodeSchema(workflowId, id);
        setSchema(nodeSchema);
      } catch (error) {
        console.error('Error loading schema:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSchema();
  }, [workflowId, id]);

  return (
    <Card className="min-w-[200px] p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium">{data?.label || 'Filter Data'}</h3>
      </div>
      
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
      
      {isLoading ? (
        <div className="py-2 text-sm text-gray-500">Loading schema...</div>
      ) : schema.length === 0 ? (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
          No schema available. Connect a data source node.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">
            {schema.length} columns available for filtering
          </div>
        </div>
      )}
    </Card>
  );
};
