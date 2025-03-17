
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  Filter,
  Info,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { toast } from 'sonner';
import { useSchemaConnection, ConnectionState } from '@/hooks/useSchemaConnection';
import WorkflowLogDialog from '@/components/workflow/WorkflowLogDialog';

const OPERATORS = {
  string: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts-with', label: 'Starts With' },
    { value: 'ends-with', label: 'Ends With' },
    { value: 'is-empty', label: 'Is Empty' },
    { value: 'is-not-empty', label: 'Is Not Empty' }
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' },
    { value: 'greater-than', label: 'Greater Than' },
    { value: 'less-than', label: 'Less Than' },
    { value: 'between', label: 'Between' },
    { value: 'is-empty', label: 'Is Empty' },
    { value: 'is-not-empty', label: 'Is Not Empty' }
  ],
  date: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' },
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'between', label: 'Between' },
    { value: 'is-empty', label: 'Is Empty' },
    { value: 'is-not-empty', label: 'Is Not Empty' }
  ],
  boolean: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' }
  ]
};

const FilteringNode = ({ id, data, selected }) => {
  const {
    config = {},
    workflowId: nodeWorkflowId,
    onChange
  } = data;
  
  const [column, setColumn] = useState(config.column || '');
  const [operator, setOperator] = useState(config.operator || 'equals');
  const [value, setValue] = useState(config.value || '');
  const [caseSensitive, setCaseSensitive] = useState(config.caseSensitive || false);
  const [retainFiltered, setRetainFiltered] = useState(config.retainFiltered || false);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  
  // Use the new schema connection hook
  const {
    sourceNodeId,
    connectionState,
    schema: columns,
    isLoading,
    error,
    getSchema
  } = useSchemaConnection(id, false);
  
  const lastOperationTime = useRef<Date | null>(null);
  
  // Get the column type based on selected column
  const columnType = useMemo(() => {
    if (!column || columns.length === 0) return 'string';
    
    const selectedColumn = columns.find(col => col.name === column);
    if (!selectedColumn) return 'string';
    
    if (selectedColumn.type === 'number') return 'number';
    if (selectedColumn.type === 'date') return 'date';
    if (selectedColumn.type === 'boolean') return 'boolean';
    
    return 'string';
  }, [column, columns]);
  
  // List of available operators based on column type
  const availableOperators = useMemo(() => {
    return OPERATORS[columnType] || OPERATORS.string;
  }, [columnType]);
  
  // Handle manual refresh button click
  const handleRefresh = useCallback(() => {
    const now = new Date();
    lastOperationTime.current = now;
    
    toast.promise(
      getSchema(true),
      {
        loading: 'Refreshing schema...',
        success: () => {
          return 'Schema refreshed successfully';
        },
        error: 'Failed to refresh schema'
      }
    );
  }, [getSchema]);
  
  // Update the parent component when configuration changes
  const updateConfig = useCallback(() => {
    if (onChange) {
      onChange(id, {
        column,
        operator,
        value,
        caseSensitive,
        retainFiltered
      });
    }
  }, [id, column, operator, value, caseSensitive, retainFiltered, onChange]);
  
  // Update column selection
  const handleColumnChange = useCallback((newColumn) => {
    setColumn(newColumn);
    
    // Reset operator if needed based on new column type
    const newColumnDef = columns.find(col => col.name === newColumn);
    if (newColumnDef) {
      const newType = newColumnDef.type === 'number' ? 'number' : 
                      newColumnDef.type === 'date' ? 'date' :
                      newColumnDef.type === 'boolean' ? 'boolean' : 'string';
      
      const currentOpExists = OPERATORS[newType].some(op => op.value === operator);
      if (!currentOpExists) {
        setOperator(OPERATORS[newType][0].value);
      }
    }
  }, [columns, operator]);
  
  // Handle operator change
  const handleOperatorChange = useCallback((newOperator) => {
    setOperator(newOperator);
    
    // Clear value for certain operators
    if (['is-empty', 'is-not-empty'].includes(newOperator)) {
      setValue('');
    }
  }, []);
  
  // Effect for auto-selecting first column if none selected
  useEffect(() => {
    if (columns.length > 0 && !column) {
      handleColumnChange(columns[0].name);
    }
  }, [columns, column, handleColumnChange]);
  
  // Save config when any option changes
  useEffect(() => {
    updateConfig();
  }, [column, operator, value, caseSensitive, retainFiltered, updateConfig]);
  
  // Display a badge based on connection state
  const getStatusBadge = () => {
    if (isLoading) {
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
          Loading
        </Badge>
      );
    }
    
    if (connectionState === 'connected') {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <Check className="h-3 w-3 mr-1" />
          Connected
        </Badge>
      );
    }
    
    if (connectionState === 'connecting') {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          <RefreshCw className="h-3 w-3 mr-1" />
          Connecting
        </Badge>
      );
    }
    
    if (connectionState === 'error' || error) {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <AlertCircle className="h-3 w-3 mr-1" />
          Error
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
        <Info className="h-3 w-3 mr-1" />
        Not Connected
      </Badge>
    );
  };
  
  return (
    <Card
      className={`w-80 shadow-md ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    >
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-blue-100">
              <Filter className="h-4 w-4 text-blue-600" />
            </div>
            <CardTitle className="text-sm">Filtering</CardTitle>
          </div>
          
          <div className="flex items-center gap-1">
            {getStatusBadge()}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6" 
              onClick={handleRefresh}
              disabled={isLoading || connectionState === 'disconnected'}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowLogs(true)}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="px-4 py-2 space-y-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="column">Column</Label>
            <Select 
              value={column} 
              onValueChange={handleColumnChange}
              disabled={columns.length === 0 || isLoading}
            >
              <SelectTrigger id="column">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map(col => (
                  <SelectItem key={col.name} value={col.name}>
                    {col.name} ({col.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="operator">Operator</Label>
            <Select 
              value={operator} 
              onValueChange={handleOperatorChange}
              disabled={!column || isLoading}
            >
              <SelectTrigger id="operator">
                <SelectValue placeholder="Select operator" />
              </SelectTrigger>
              <SelectContent>
                {availableOperators.map(op => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {!['is-empty', 'is-not-empty'].includes(operator) && (
            <div className="space-y-1.5">
              <Label htmlFor="value">Value</Label>
              <Input
                id="value"
                type={columnType === 'number' ? 'number' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!column || !operator || isLoading}
                placeholder={`Enter ${columnType} value`}
              />
            </div>
          )}
          
          {columnType === 'string' && (
            <div className="flex items-center space-x-2 mt-2">
              <Checkbox
                id="case-sensitive"
                checked={caseSensitive}
                onCheckedChange={setCaseSensitive}
                disabled={!column || isLoading}
              />
              <Label htmlFor="case-sensitive" className="text-sm font-normal">
                Case sensitive
              </Label>
            </div>
          )}
          
          <div className="flex items-center space-x-2 mt-2">
            <Checkbox
              id="retain-filtered"
              checked={retainFiltered}
              onCheckedChange={setRetainFiltered}
              disabled={isLoading}
            />
            <Label htmlFor="retain-filtered" className="text-sm font-normal">
              Create separate output for filtered items
            </Label>
          </div>
        </div>
        
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="details">
            <AccordionTrigger className="py-1 text-xs">
              <span className="text-gray-500">Details</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-1 text-xs text-gray-500">
                <p>Source: {sourceNodeId || 'None'}</p>
                <p>Connection: {connectionState}</p>
                <p>Columns: {columns.length}</p>
                {error && <p className="text-red-500">Error: {error}</p>}
                {lastOperationTime.current && (
                  <p>Last update: {lastOperationTime.current.toLocaleTimeString()}</p>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
      
      <Handle type="target" position={Position.Top} id="in" />
      <Handle type="source" position={Position.Bottom} id="out" />
      {retainFiltered && <Handle type="source" position={Position.Bottom} id="filtered" className="left-[30%]" />}
      
      {/* Logs dialog */}
      {showLogs && (
        <WorkflowLogDialog
          selectedNodeId={id}
          isOpen={showLogs}
          onOpenChange={setShowLogs}
        />
      )}
    </Card>
  );
};

export default FilteringNode;
