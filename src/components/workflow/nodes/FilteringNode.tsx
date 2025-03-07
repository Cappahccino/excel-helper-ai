
import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Filter, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NodeProps } from '@/types/workflow';
import { useWorkflow } from '../context/WorkflowContext';

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
  id: string;
}

interface SourceFile {
  nodeId: string;
  fileId: string;
  hasColumns: boolean;
}

const FilteringNode: React.FC<FilteringNodeProps> = ({ data, id }) => {
  const label = data?.label || 'Filtering';
  const { fileSchemas, workflowId } = useWorkflow();
  
  const [selectedColumn, setSelectedColumn] = useState<string | undefined>(data?.config?.column);
  const [operator, setOperator] = useState<string>(data?.config?.operator || 'equals');
  const [filterValue, setFilterValue] = useState<string>(data?.config?.value || '');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  
  // Prevent default behavior
  const handleNodeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  // Find connected source nodes with file schemas
  useEffect(() => {
    // Find any file schemas that can be used as a source
    if (fileSchemas.length > 0) {
      const availableSources = fileSchemas.map(schema => ({
        nodeId: schema.nodeId,
        fileId: schema.fileId,
        hasColumns: Array.isArray(schema.columns) && schema.columns.length > 0
      }));
      
      setSourceFiles(availableSources);
      
      if (availableSources.length > 0) {
        const sourcesWithColumns = availableSources.filter(source => source.hasColumns);
        
        if (sourcesWithColumns.length > 0) {
          // Take the first available source with columns as default
          const firstSource = sourcesWithColumns[0];
          const schema = fileSchemas.find(schema => schema.nodeId === firstSource.nodeId);
          
          if (schema) {
            setAvailableColumns(schema.columns || []);
            setErrorMessage(null);
          }
        } else {
          setErrorMessage("Connected files don't have column information");
        }
      } else {
        setErrorMessage("No file sources available");
      }
    } else {
      setErrorMessage("Connect to a file upload node first");
    }
  }, [fileSchemas]);
  
  // Update configuration when selections change
  useEffect(() => {
    if (selectedColumn !== undefined && data?.onChange) {
      data.onChange(id, {
        column: selectedColumn,
        operator,
        value: filterValue
      });
    }
  }, [selectedColumn, operator, filterValue, id, data?.onChange]);
  
  // Update local state if configuration changes from outside
  useEffect(() => {
    if (data?.config) {
      if (data.config.column !== undefined) {
        setSelectedColumn(data.config.column);
      }
      if (data.config.operator) {
        setOperator(data.config.operator);
      }
      if (data.config.value !== undefined) {
        setFilterValue(data.config.value);
      }
    }
  }, [data?.config]);
  
  const handleColumnChange = (column: string) => {
    setSelectedColumn(column);
  };
  
  const handleOperatorChange = (op: string) => {
    setOperator(op);
  };
  
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterValue(e.target.value);
  };
  
  const renderPreview = () => {
    if (!selectedColumn) return null;
    
    const schema = fileSchemas.find(s => s.columns.includes(selectedColumn));
    if (!schema || !schema.previewData) return null;
    
    // Apply filter to preview data
    const filteredData = schema.previewData.filter(row => {
      const cellValue = String(row[selectedColumn] || '');
      const compareValue = filterValue;
      
      switch (operator) {
        case 'equals':
          return cellValue === compareValue;
        case 'not-equals':
          return cellValue !== compareValue;
        case 'contains':
          return cellValue.includes(compareValue);
        case 'greater-than':
          return Number(cellValue) > Number(compareValue);
        case 'less-than':
          return Number(cellValue) < Number(compareValue);
        case 'starts-with':
          return cellValue.startsWith(compareValue);
        case 'ends-with':
          return cellValue.endsWith(compareValue);
        default:
          return true;
      }
    });
    
    return (
      <div className="mt-2">
        <Label className="text-xs mb-1">Preview ({filteredData.length} matching rows)</Label>
        <div className="overflow-hidden rounded border border-gray-200 bg-gray-50 p-2">
          <div className="text-xs text-gray-500">
            {filteredData.length > 0 ? (
              <div className="overflow-x-auto max-h-20">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      {schema.columns.slice(0, 3).map(col => (
                        <th key={col} className="px-2 py-1 text-left text-xs font-medium text-gray-500">
                          {col === selectedColumn ? (
                            <Badge variant="outline" className="font-normal">{col}</Badge>
                          ) : (
                            col
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.slice(0, 3).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {schema.columns.slice(0, 3).map(col => (
                          <td key={col} className="px-2 py-1 text-xs">
                            {row[col] !== undefined ? String(row[col]).slice(0, 15) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-2 text-center">No matching rows</div>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <Card 
      className="w-[300px] shadow-md"
      onClick={handleNodeClick}
    >
      <CardHeader className="bg-yellow-50 py-2 flex flex-row items-center">
        <Filter className="h-4 w-4 mr-2 text-yellow-600" />
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          {errorMessage ? (
            <div className="flex items-center text-xs text-red-500">
              <AlertCircle className="h-3 w-3 mr-1" />
              {errorMessage}
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Column</Label>
                <Select 
                  value={selectedColumn} 
                  onValueChange={handleColumnChange}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableColumns.map(column => (
                      <SelectItem key={column} value={column} className="text-xs">
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1">
                <Label className="text-xs">Operator</Label>
                <Select 
                  value={operator} 
                  onValueChange={handleOperatorChange}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Select operator" />
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
                <Label className="text-xs">Value</Label>
                <Input
                  type="text"
                  value={filterValue}
                  onChange={handleValueChange}
                  placeholder="Enter filter value"
                  className="text-xs"
                />
              </div>
              
              {selectedColumn && renderPreview()}
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
