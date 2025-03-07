
import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NodeProps } from '@/types/workflow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useWorkflow } from '../context/WorkflowContext';
import { Filter } from 'lucide-react';

// Interface for the filtering node props
interface FilteringNodeProps extends NodeProps {
  data?: {
    label?: string;
    config?: {
      column?: string;
      operator?: 'equals' | 'not-equals' | 'contains' | 'greater-than' | 'less-than' | 'starts-with' | 'ends-with';
      value?: string;
      isCaseSensitive?: boolean;
    };
    onChange?: (nodeId: string, config: any) => void;
  };
}

const FilteringNode: React.FC<FilteringNodeProps> = ({ id, data }) => {
  const { getFileSchema } = useWorkflow();
  
  const [column, setColumn] = useState<string | undefined>(data?.config?.column);
  const [operator, setOperator] = useState<string>(data?.config?.operator || 'equals');
  const [filterValue, setFilterValue] = useState<string>(data?.config?.value || '');
  const [isCaseSensitive, setIsCaseSensitive] = useState<boolean>(data?.config?.isCaseSensitive || false);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  
  const label = data?.label || 'Filter';

  // Fetch available columns from connected input nodes
  useEffect(() => {
    if (!id) return;
    
    const schema = getFileSchema(id);
    if (schema) {
      setAvailableColumns(schema.columns || []);
    }
  }, [id, getFileSchema]);

  // Update node data when configuration changes
  const updateNodeData = (updates: Partial<FilteringNodeProps['data']['config']>) => {
    const newConfig = {
      ...data?.config,
      ...updates
    };
    
    if (data?.onChange) {
      data.onChange(id || '', newConfig);
    }
  };

  // Handle column change
  const handleColumnChange = (value: string) => {
    setColumn(value);
    updateNodeData({ column: value });
  };

  // Handle operator change
  const handleOperatorChange = (value: string) => {
    setOperator(value);
    updateNodeData({ 
      operator: value as 'equals' | 'not-equals' | 'contains' | 'greater-than' | 'less-than' | 'starts-with' | 'ends-with' 
    });
  };

  // Handle filter value change
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterValue(e.target.value);
    updateNodeData({ value: e.target.value });
  };

  // Handle case sensitivity toggle
  const handleCaseSensitivityChange = (checked: boolean) => {
    setIsCaseSensitive(checked);
    updateNodeData({ isCaseSensitive: checked });
  };

  return (
    <Card className="w-[280px] shadow-md">
      <CardHeader className="bg-purple-50 py-2 flex flex-row items-center">
        <Filter className="h-4 w-4 mr-2 text-purple-500" />
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="column" className="text-xs">Column</Label>
            <Select value={column} onValueChange={handleColumnChange}>
              <SelectTrigger id="column" className="h-8 text-xs">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {availableColumns.length > 0 ? (
                  availableColumns.map((col) => (
                    <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled className="text-xs text-muted-foreground">
                    No columns available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {availableColumns.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Connect to a data source first
              </p>
            )}
          </div>

          {column && (
            <>
              <div className="space-y-1">
                <Label htmlFor="operator" className="text-xs">Condition</Label>
                <Select value={operator} onValueChange={handleOperatorChange}>
                  <SelectTrigger id="operator" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals" className="text-xs">Equals</SelectItem>
                    <SelectItem value="not-equals" className="text-xs">Not equals</SelectItem>
                    <SelectItem value="contains" className="text-xs">Contains</SelectItem>
                    <SelectItem value="greater-than" className="text-xs">Greater than</SelectItem>
                    <SelectItem value="less-than" className="text-xs">Less than</SelectItem>
                    <SelectItem value="starts-with" className="text-xs">Starts with</SelectItem>
                    <SelectItem value="ends-with" className="text-xs">Ends with</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="value" className="text-xs">Value</Label>
                <Input
                  id="value"
                  placeholder="Enter value to filter by"
                  value={filterValue}
                  onChange={handleValueChange}
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="case-sensitive"
                  checked={isCaseSensitive}
                  onCheckedChange={handleCaseSensitivityChange}
                  className="data-[state=checked]:bg-purple-500"
                />
                <Label htmlFor="case-sensitive" className="text-xs">Case sensitive</Label>
              </div>
            </>
          )}
        </div>
      </CardContent>
      
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="w-2 h-2 !bg-purple-500"
      />
      
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="w-2 h-2 !bg-purple-500"
      />
    </Card>
  );
};

export default FilteringNode;
