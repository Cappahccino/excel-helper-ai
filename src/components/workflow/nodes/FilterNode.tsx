
import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { schemaUtils, SchemaColumn } from '@/utils/schemaUtils';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

interface FilterNodeProps {
  id: string;
  data: {
    label: string;
    config: {
      column: string;
      operator: string;
      value: string;
    };
    onConfigChange?: (config: any) => void;
    onShowLogs?: (nodeId: string) => void;
  };
}

export const FilterNode: React.FC<FilterNodeProps> = ({ id, data }) => {
  const { workflowId } = useWorkflow();
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [filterConfig, setFilterConfig] = useState({
    column: data.config?.column || '',
    operator: data.config?.operator || 'equals',
    value: data.config?.value || ''
  });
  
  // Load schema when component mounts
  useEffect(() => {
    const loadSchema = async () => {
      if (!workflowId || !id) return;
      
      setIsLoading(true);
      try {
        const nodeSchema = await schemaUtils.getNodeSchema(workflowId, id);
        setSchema(nodeSchema);
        
        // Initialize config if we have a column
        if (nodeSchema.length > 0 && !filterConfig.column) {
          handleConfigChange('column', nodeSchema[0].name);
        }
      } catch (error) {
        console.error('Error loading schema for filter node:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSchema();
  }, [workflowId, id]);

  // Get current column type from schema
  const getColumnType = (columnName: string): string => {
    const column = schema.find(col => col.name === columnName);
    return column?.type || 'string';
  };
  
  // Get operators based on column type
  const getOperators = (columnType: string) => {
    const commonOperators = [
      { value: 'equals', label: 'Equals' },
      { value: 'not-equals', label: 'Not Equals' }
    ];
    
    switch (columnType) {
      case 'string':
        return [
          ...commonOperators,
          { value: 'contains', label: 'Contains' },
          { value: 'starts-with', label: 'Starts With' },
          { value: 'ends-with', label: 'Ends With' }
        ];
      case 'number':
        return [
          ...commonOperators,
          { value: 'greater-than', label: 'Greater Than' },
          { value: 'less-than', label: 'Less Than' },
          { value: 'between', label: 'Between' }
        ];
      case 'date':
        return [
          ...commonOperators,
          { value: 'before', label: 'Before' },
          { value: 'after', label: 'After' },
          { value: 'between', label: 'Between' }
        ];
      case 'boolean':
        return commonOperators;
      default:
        return commonOperators;
    }
  };
  
  // Handle changes to filter configuration
  const handleConfigChange = (field: string, value: string) => {
    const newConfig = { ...filterConfig, [field]: value };
    setFilterConfig(newConfig);
    
    // Update node data through parent
    if (data.onConfigChange) {
      data.onConfigChange({
        ...data.config,
        ...newConfig
      });
    }
    
    // If changing column, reset operator if needed
    if (field === 'column') {
      const columnType = getColumnType(value);
      const operators = getOperators(columnType);
      if (!operators.find(op => op.value === filterConfig.operator)) {
        const newOperator = operators[0].value;
        handleConfigChange('operator', newOperator);
      }
    }
  };
  
  // Process data and show results
  const handleProcessData = async () => {
    if (!workflowId || !id) return;
    
    if (!filterConfig.column || !filterConfig.operator) {
      toast.error('Please select a column and operator');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Create a preview execution ID
      const previewId = `preview-${uuidv4()}`;
      
      // Call the process-node-data edge function
      const { data: processResult, error } = await supabase.functions.invoke('process-node-data', {
        body: {
          nodeId: id,
          workflowId: workflowId,
          operation: 'filtering',
          config: filterConfig,
          previewMode: true,
          executionId: previewId
        }
      });
      
      if (error) {
        throw new Error(`Processing failed: ${error.message}`);
      }
      
      if (!processResult.success) {
        throw new Error(processResult.error || 'Processing failed');
      }
      
      toast.success('Filter preview generated');
      
      // Show logs if handler provided
      if (data.onShowLogs) {
        data.onShowLogs(id);
      }
    } catch (error) {
      console.error('Error processing data:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const columnType = getColumnType(filterConfig.column);
  const operators = getOperators(columnType);
  
  return (
    <Card className="min-w-[280px] p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium">{data.label || 'Filter Data'}</h3>
      </div>
      
      {/* Connection handles */}
      <Handle type="target" position={Position.Left} id="in" className="w-2 h-2" />
      <Handle type="source" position={Position.Right} id="out" className="w-2 h-2" />
      
      {isLoading ? (
        <div className="py-2 text-sm text-gray-500">Loading schema...</div>
      ) : schema.length === 0 ? (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
          No schema available. Connect a data source node.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Column selection */}
          <div>
            <Label htmlFor="column" className="mb-1 block">Column</Label>
            <Select value={filterConfig.column} onValueChange={(value) => handleConfigChange('column', value)}>
              <SelectTrigger id="column">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {schema.map((column) => (
                  <SelectItem key={column.name} value={column.name}>
                    {column.name} ({column.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Operator selection */}
          {filterConfig.column && (
            <div>
              <Label htmlFor="operator" className="mb-1 block">Operator</Label>
              <Select value={filterConfig.operator} onValueChange={(value) => handleConfigChange('operator', value)}>
                <SelectTrigger id="operator">
                  <SelectValue placeholder="Select operator" />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Filter value */}
          {filterConfig.operator && (
            <div>
              <Label htmlFor="value" className="mb-1 block">
                {filterConfig.operator === 'between' ? 'Range (comma-separated)' : 'Value'}
              </Label>
              <Input
                id="value"
                value={filterConfig.value}
                onChange={(e) => handleConfigChange('value', e.target.value)}
                placeholder={filterConfig.operator === 'between' ? 'min, max' : 'Enter value'}
              />
            </div>
          )}
          
          {/* Process button */}
          <Button 
            className="w-full mt-2"
            onClick={handleProcessData}
            disabled={isProcessing || !filterConfig.column || !filterConfig.operator}
          >
            {isProcessing ? 'Processing...' : 'Preview Results'}
          </Button>
        </div>
      )}
    </Card>
  );
};
