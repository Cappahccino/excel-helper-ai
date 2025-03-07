import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Filter, Search, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataProcessingNodeData, NodeProps, FileSchema } from '@/types/workflow';
import { useWorkflow } from '../context/WorkflowContext';

const FilteringNode: React.FC<NodeProps<DataProcessingNodeData>> = ({ 
  data,
  id,
  selected
}) => {
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [operator, setOperator] = useState<string>('equals');
  const [filterValue, setFilterValue] = useState<string>('');
  const [filterPreview, setFilterPreview] = useState<any[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  
  const { 
    getConnectedNodes,
    updateNodeData, 
    fileSchemas,
    workflowId
  } = useWorkflow();
  
  const label = data?.label || 'Filter Data';
  
  // Find the source file schema
  const [sourceFileSchema, setSourceFileSchema] = useState<FileSchema | null>(null);
  
  // Get input connections
  useEffect(() => {
    const loadSourceSchema = async () => {
      const { sources } = getConnectedNodes(id);
      
      // Find file upload nodes
      const fileUploadNodes = sources.filter(node => 
        node.type === 'fileUpload' && node.data?.config?.fileId
      );
      
      if (fileUploadNodes.length > 0) {
        // Use the first connected file upload node
        const sourceNode = fileUploadNodes[0];
        const fileId = sourceNode.data?.config?.fileId;
        
        if (fileId) {
          // Find schema in context
          const schema = fileSchemas.find(schema => 
            schema.fileId === fileId && schema.nodeId === sourceNode.id
          );
          
          if (schema) {
            setSourceFileSchema(schema);
            
            // If a column was previously selected and still exists, keep it
            if (data?.config?.column && schema.columns.includes(data.config.column)) {
              setSelectedColumn(data.config.column);
              setOperator(data.config?.operator || 'equals');
              setFilterValue(data.config?.value || '');
            } else if (schema.columns.length > 0) {
              // Otherwise select the first column
              setSelectedColumn(schema.columns[0]);
            }
          }
        }
      }
    };
    
    loadSourceSchema();
  }, [id, getConnectedNodes, fileSchemas, data?.config]);
  
  // Update filter configuration when values change
  useEffect(() => {
    if (id && data && selectedColumn) {
      updateNodeData(id, {
        config: {
          ...(data.config || {}),
          column: selectedColumn,
          operator,
          value: filterValue
        }
      });
    }
  }, [id, selectedColumn, operator, filterValue, updateNodeData, data]);
  
  // Generate filter preview when configuration changes
  useEffect(() => {
    const generatePreview = () => {
      if (!sourceFileSchema || !selectedColumn || !sourceFileSchema.sampleData) {
        setFilterPreview([]);
        return;
      }
      
      setIsPreviewLoading(true);
      
      try {
        // Apply filter to sample data
        const filtered = sourceFileSchema.sampleData.filter(row => {
          const cellValue = row[selectedColumn];
          
          if (cellValue === undefined || cellValue === null) {
            return false;
          }
          
          // Apply the selected operator
          switch (operator) {
            case 'equals':
              return String(cellValue).toLowerCase() === String(filterValue).toLowerCase();
            case 'not-equals':
              return String(cellValue).toLowerCase() !== String(filterValue).toLowerCase();
            case 'contains':
              return String(cellValue).toLowerCase().includes(String(filterValue).toLowerCase());
            case 'greater-than':
              return Number(cellValue) > Number(filterValue);
            case 'less-than':
              return Number(cellValue) < Number(filterValue);
            case 'starts-with':
              return String(cellValue).toLowerCase().startsWith(String(filterValue).toLowerCase());
            case 'ends-with':
              return String(cellValue).toLowerCase().endsWith(String(filterValue).toLowerCase());
            default:
              return true;
          }
        });
        
        setFilterPreview(filtered);
      } catch (error) {
        console.error('Error generating filter preview:', error);
        setFilterPreview([]);
      } finally {
        setIsPreviewLoading(false);
      }
    };
    
    generatePreview();
  }, [sourceFileSchema, selectedColumn, operator, filterValue]);
  
  // Get valid operators based on column data type
  const getOperatorsForColumnType = (columnName: string | null): { value: string, label: string }[] => {
    if (!columnName || !sourceFileSchema) {
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'not-equals', label: 'Not equals' },
        { value: 'contains', label: 'Contains' }
      ];
    }
    
    const dataType = sourceFileSchema.dataTypes[columnName];
    
    switch (dataType) {
      case 'number':
      case 'integer':
      case 'decimal':
        return [
          { value: 'equals', label: 'Equals' },
          { value: 'not-equals', label: 'Not equals' },
          { value: 'greater-than', label: 'Greater than' },
          { value: 'less-than', label: 'Less than' }
        ];
      case 'date':
        return [
          { value: 'equals', label: 'Equals' },
          { value: 'not-equals', label: 'Not equals' },
          { value: 'greater-than', label: 'After' },
          { value: 'less-than', label: 'Before' }
        ];
      case 'boolean':
        return [
          { value: 'equals', label: 'Equals' },
          { value: 'not-equals', label: 'Not equals' }
        ];
      case 'string':
      default:
        return [
          { value: 'equals', label: 'Equals' },
          { value: 'not-equals', label: 'Not equals' },
          { value: 'contains', label: 'Contains' },
          { value: 'starts-with', label: 'Starts with' },
          { value: 'ends-with', label: 'Ends with' }
        ];
    }
  };
  
  return (
    <Card className="w-[300px] shadow-md">
      <CardHeader className="bg-blue-50 py-2 flex flex-row items-center">
        <div className="p-1 rounded-md bg-blue-100">
          <Filter className="h-4 w-4" />
        </div>
        <CardTitle className="text-sm font-medium ml-2">{label}</CardTitle>
      </CardHeader>
      
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-gray-600">
            Filter data based on conditions
          </div>
          
          <div className="border rounded p-2 bg-gray-50">
            {!sourceFileSchema ? (
              <div className="text-sm text-amber-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                Connect to a data source first
              </div>
            ) : (
              <>
                <div className="font-medium text-xs mb-2">
                  <span>Configuration:</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="column">Column</Label>
                    <Select 
                      value={selectedColumn || ''} 
                      onValueChange={(value) => setSelectedColumn(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {sourceFileSchema.columns.map(column => (
                          <SelectItem key={column} value={column}>
                            {column} ({sourceFileSchema.dataTypes[column] || 'unknown'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {selectedColumn && (
                    <>
                      <div>
                        <Label htmlFor="operator">Operator</Label>
                        <Select 
                          value={operator} 
                          onValueChange={(value) => setOperator(value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select operator" />
                          </SelectTrigger>
                          <SelectContent>
                            {getOperatorsForColumnType(selectedColumn).map(op => (
                              <SelectItem key={op.value} value={op.value}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="value">Value</Label>
                        <Input 
                          id="value" 
                          value={filterValue} 
                          onChange={(e) => setFilterValue(e.target.value)} 
                          placeholder="Filter value" 
                        />
                      </div>
                      
                      {/* Preview section */}
                      {sourceFileSchema.sampleData && sourceFileSchema.sampleData.length > 0 && (
                        <div className="mt-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-xs">Results preview</Label>
                            <Badge variant="outline" className="text-xs">
                              {isPreviewLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                filterPreview.length
                              )} 
                              {isPreviewLoading ? 'Loading...' : 'rows'}
                            </Badge>
                          </div>
                          
                          {filterPreview.length > 0 ? (
                            <div className="mt-1 border rounded overflow-x-auto max-h-[100px]">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted">
                                    {sourceFileSchema.columns.slice(0, 3).map(column => (
                                      <th key={column} className="px-2 py-1 text-left font-medium">
                                        {column}
                                      </th>
                                    ))}
                                    {sourceFileSchema.columns.length > 3 && (
                                      <th className="px-2 py-1 text-left font-medium">...</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {filterPreview.slice(0, 3).map((row, index) => (
                                    <tr key={index} className="border-t">
                                      {sourceFileSchema.columns.slice(0, 3).map(column => (
                                        <td key={column} className="px-2 py-1 truncate max-w-[100px]">
                                          {String(row[column] ?? '')}
                                        </td>
                                      ))}
                                      {sourceFileSchema.columns.length > 3 && (
                                        <td className="px-2 py-1">...</td>
                                      )}
                                    </tr>
                                  ))}
                                  {filterPreview.length > 3 && (
                                    <tr className="border-t">
                                      <td colSpan={Math.min(4, sourceFileSchema.columns.length)} className="px-2 py-1 text-center text-muted-foreground">
                                        + {filterPreview.length - 3} more rows
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-muted-foreground border rounded p-2 text-center">
                              No rows match the filter criteria
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
      
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-blue-500"
      />
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-blue-500"
      />
    </Card>
  );
};

export default FilteringNode;
