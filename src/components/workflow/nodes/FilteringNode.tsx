
import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Filter } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { NodeProps, BaseNodeData, ProcessingNodeType } from '@/types/workflow';

// Define a proper data interface that extends BaseNodeData
export interface FilteringNodeData extends BaseNodeData {
  type: ProcessingNodeType;  // This is required by BaseNodeData
  config: {
    column?: string;
    operator?: "equals" | "contains" | "not-equals" | "greater-than" | "less-than" | "starts-with" | "ends-with";
    value?: string;
    isCaseSensitive?: boolean;
    [key: string]: any;
  };
  onChange?: (nodeId: string, config: any) => void;
}

// Update FilteringNodeProps to use the correct data type
export interface FilteringNodeProps extends NodeProps<FilteringNodeData> {
  // Additional props specific to FilteringNode can go here
}

const FilteringNode: React.FC<FilteringNodeProps> = ({ data, id }) => {
  const { getFileSchema } = useWorkflow();
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string | undefined>(data?.config?.column);
  const [operator, setOperator] = useState<string | undefined>(data?.config?.operator || 'equals');
  const [filterValue, setFilterValue] = useState<string | undefined>(data?.config?.value || '');
  
  // Default label if not provided
  const label = data?.label || 'Filter Data';

  // Get file schema when component mounts or when connections change
  useEffect(() => {
    const fetchSchema = async () => {
      if (getFileSchema) {
        try {
          // Await the Promise returned by getFileSchema
          const schema = await getFileSchema(id);
          if (schema && schema.columns) {
            setAvailableColumns(schema.columns);
          }
        } catch (error) {
          console.error("Failed to fetch file schema:", error);
          setAvailableColumns([]);
        }
      }
    };
    
    fetchSchema();
  }, [id, getFileSchema]);

  // Update configuration when user changes settings
  const updateConfig = (updates: Partial<FilteringNodeData['config']>) => {
    if (data?.onChange && id) {
      const updatedConfig = {
        ...data.config,
        ...updates
      };
      data.onChange(id, { config: updatedConfig });
    }
  };

  // Handle column selection
  const handleColumnChange = (value: string) => {
    setSelectedColumn(value);
    updateConfig({ column: value });
  };

  // Handle operator selection
  const handleOperatorChange = (value: string) => {
    setOperator(value);
    updateConfig({ operator: value as any });
  };

  // Handle filter value input
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterValue(e.target.value);
    updateConfig({ value: e.target.value });
  };

  return (
    <Card className="w-[300px] shadow-md">
      <CardHeader className="bg-yellow-50 py-2 flex flex-row items-center">
        <Filter className="h-4 w-4 mr-2 text-yellow-500" />
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Column</Label>
            <Select
              value={selectedColumn}
              onValueChange={handleColumnChange}
              disabled={availableColumns.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {availableColumns.map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableColumns.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No columns available. Connect this node to a data source.
              </p>
            )}
          </div>

          {selectedColumn && (
            <>
              <div className="space-y-2">
                <Label>Operator</Label>
                <Select value={operator} onValueChange={handleOperatorChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="not-equals">Not Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="greater-than">Greater Than</SelectItem>
                    <SelectItem value="less-than">Less Than</SelectItem>
                    <SelectItem value="starts-with">Starts With</SelectItem>
                    <SelectItem value="ends-with">Ends With</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  type="text"
                  value={filterValue}
                  onChange={handleValueChange}
                  placeholder="Filter value"
                />
              </div>
            </>
          )}
        </div>
      </CardContent>

      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="w-2 h-2 !bg-yellow-500"
      />
      
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="w-2 h-2 !bg-yellow-500"
      />
    </Card>
  );
};

export default FilteringNode;
