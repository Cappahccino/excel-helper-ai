
import React, { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { FilterIcon } from 'lucide-react';
import { SchemaColumn } from '@/hooks/useNodeManagement';

interface FilteringNodeProps {
  id: string;
  data: {
    label: string;
    config: {
      column?: string;
      operator?: "equals" | "contains" | "not-equals" | "greater-than" | "less-than" | "starts-with" | "ends-with";
      value?: string;
      isCaseSensitive?: boolean;
    };
    onChange?: (nodeId: string, config: any) => void;
  };
  selected?: boolean;
}

const FilteringNode: React.FC<FilteringNodeProps> = ({ id, data, selected }) => {
  const [columns, setColumns] = useState<string[]>([]);
  const [operators, setOperators] = useState<string[]>([]);
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const workflow = useWorkflow();

  useEffect(() => {
    const loadSchema = async () => {
      setIsLoading(true);
      try {
        // Find connected input nodes by checking edges
        if (!workflow.workflowId) return;
        
        const edges = await workflow.getEdges(workflow.workflowId);
        const inputNodeIds = edges
          .filter(edge => edge.target === id)
          .map(edge => edge.source);
        
        if (inputNodeIds.length === 0) return;
        
        // Use the first connected input node to get schema
        const fileSchema = await workflow.getFileSchema?.(inputNodeIds[0]);
        
        if (fileSchema) {
          setColumns(fileSchema.columns);
          
          // Convert fileSchema to SchemaColumn[] format
          const schemaColumns = fileSchema.columns.map(col => ({
            name: col,
            type: (fileSchema.types[col] as any) || 'string'
          }));
          
          setSchema(schemaColumns);
          
          // Set appropriate operators based on selected column type
          updateOperatorsForColumn(data.config.column, schemaColumns);
        }
      } catch (error) {
        console.error('Error loading schema for filtering node:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSchema();
  }, [id, workflow, data.config.column]);

  const updateOperatorsForColumn = (columnName?: string, schemaColumns?: SchemaColumn[]) => {
    if (!columnName || !schemaColumns) {
      setOperators(['equals', 'not-equals', 'contains', 'starts-with', 'ends-with']);
      return;
    }
    
    const column = schemaColumns.find(col => col.name === columnName);
    
    if (column) {
      switch(column.type) {
        case 'number':
          setOperators(['equals', 'not-equals', 'greater-than', 'less-than']);
          break;
        case 'date':
          setOperators(['equals', 'not-equals', 'greater-than', 'less-than']);
          break;
        case 'boolean':
          setOperators(['equals', 'not-equals']);
          break;
        default:
          setOperators(['equals', 'not-equals', 'contains', 'starts-with', 'ends-with']);
      }
    }
  };

  const handleConfigChange = (key: string, value: any) => {
    if (data.onChange) {
      const newConfig = { ...data.config, [key]: value };
      
      // If column changes, update the available operators
      if (key === 'column') {
        updateOperatorsForColumn(value, schema);
      }
      
      data.onChange(id, newConfig);
    }
  };

  return (
    <Card className={`min-w-[280px] ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <CardHeader className="bg-blue-50 p-3 flex flex-row items-center">
        <FilterIcon className="w-4 h-4 mr-2 text-blue-600" />
        <CardTitle className="text-sm font-medium">{data.label || 'Filter Data'}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="column" className="text-xs">Column</Label>
          <Select
            value={data.config.column || ''}
            onValueChange={(value) => handleConfigChange('column', value)}
            disabled={isLoading || columns.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((column) => (
                <SelectItem key={column} value={column}>{column}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="operator" className="text-xs">Operator</Label>
          <Select
            value={data.config.operator || 'equals'}
            onValueChange={(value) => handleConfigChange('operator', value)}
            disabled={!data.config.column}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select operator" />
            </SelectTrigger>
            <SelectContent>
              {operators.map((op) => (
                <SelectItem key={op} value={op}>
                  {op.replace(/-/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="value" className="text-xs">Value</Label>
          <Input
            id="value"
            value={data.config.value || ''}
            onChange={(e) => handleConfigChange('value', e.target.value)}
            placeholder="Value to filter by"
            className="h-8 text-xs"
          />
        </div>

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </CardContent>
    </Card>
  );
};

export default FilteringNode;
