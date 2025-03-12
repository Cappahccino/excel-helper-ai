import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FilterIcon, AlertTriangle } from 'lucide-react';
import { useSchemaManagement } from '@/hooks/useSchemaManagement';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

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
    workflowId?: string;
  };
  selected?: boolean;
}

const OPERATORS = {
  string: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts-with', label: 'Starts With' },
    { value: 'ends-with', label: 'Ends With' }
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' },
    { value: 'greater-than', label: 'Greater Than' },
    { value: 'less-than', label: 'Less Than' }
  ],
  date: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'After' },
    { value: 'less-than', label: 'Before' }
  ],
  boolean: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' }
  ],
  default: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' }
  ]
};

const FilteringNode: React.FC<FilteringNodeProps> = ({ id, data, selected }) => {
  const [columns, setColumns] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localConfig, setLocalConfig] = useState(data.config || {});
  const { getNodeSchema } = useSchemaManagement();

  useEffect(() => {
    if (data.config) {
      setLocalConfig(data.config);
    }
  }, [data.config]);

  useEffect(() => {
    const loadSchema = async () => {
      if (!data.workflowId || !id) return;

      setIsLoading(true);
      setError(null);

      try {
        const schema = await getNodeSchema(data.workflowId, id);
        if (schema) {
          setColumns(schema);
        } else {
          setError('No schema available');
          setColumns([]);
        }
      } catch (err) {
        console.error('Error loading schema:', err);
        setError('Failed to load schema');
      } finally {
        setIsLoading(false);
      }
    };

    loadSchema();
  }, [id, data.workflowId, getNodeSchema]);

  const handleConfigChange = useCallback((key: string, value: any) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    
    if (data.onChange) {
      data.onChange(id, newConfig);
    }
  }, [id, localConfig, data.onChange]);

  const isTextType = (type: string): boolean => {
    return type === 'string' || type === 'text';
  };

  const selectedColumnType = localConfig.column 
    ? columns.find(col => col.name === localConfig.column)?.type || 'unknown'
    : 'unknown';

  const showCaseSensitiveOption = isTextType(selectedColumnType);

  const getValuePlaceholder = () => {
    const type = selectedColumnType;
    const operator = localConfig.operator;
    
    if (type === 'date') {
      return 'YYYY-MM-DD';
    }
    
    if (type === 'number') {
      return 'Numeric value';
    }
    
    if (type === 'boolean') {
      return 'true or false';
    }
    
    if (operator === 'contains') {
      return 'Text to search for';
    }
    
    if (operator === 'starts-with') {
      return 'Text that starts with...';
    }
    
    if (operator === 'ends-with') {
      return 'Text that ends with...';
    }
    
    return 'Value to match';
  };

  return (
    <Card className={`min-w-[280px] ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <CardHeader className="bg-blue-50 p-3 flex flex-row items-center">
        <FilterIcon className="w-4 h-4 mr-2 text-blue-600" />
        <CardTitle className="text-sm font-medium">{data.label || 'Filter Data'}</CardTitle>
      </CardHeader>
      
      <CardContent className="p-3 space-y-3">
        {error && (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 mr-1 text-amber-500" />
              {error}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="column">Column</Label>
          <Select
            value={localConfig.column || ''}
            onValueChange={(value) => handleConfigChange('column', value)}
            disabled={isLoading || columns.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {columns.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-gray-500">
                  {isLoading ? 'Loading columns...' : 'No columns available'}
                </div>
              ) : (
                columns.map((column) => (
                  <SelectItem key={column.name} value={column.name}>
                    <div className="flex items-center">
                      {column.name}
                      <Badge variant="outline" className="ml-2 text-[9px] py-0 h-4">
                        {column.type}
                      </Badge>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {localConfig.column && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="operator">Operator</Label>
              <Select
                value={localConfig.operator || 'equals'}
                onValueChange={(value) => handleConfigChange('operator', value)}
                disabled={!localConfig.column}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select operator" />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS[columns.find(col => col.name === localConfig.column)?.type || 'default'].map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="value">Value</Label>
              <Input
                id="value"
                value={localConfig.value || ''}
                onChange={(e) => handleConfigChange('value', e.target.value)}
                placeholder={getValuePlaceholder()}
                className="h-8 text-xs"
              />
            </div>

            {showCaseSensitiveOption && (
              <div className="flex items-center justify-between">
                <Label htmlFor="caseSensitive" className="text-xs">Case Sensitive</Label>
                <Switch
                  id="caseSensitive"
                  checked={localConfig.isCaseSensitive ?? true}
                  onCheckedChange={(checked) => handleConfigChange('isCaseSensitive', checked)}
                />
              </div>
            )}
          </>
        )}

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </CardContent>
    </Card>
  );
};

export default FilteringNode;
