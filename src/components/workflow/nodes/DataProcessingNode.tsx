
import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useDataProcessing } from '@/hooks/useDataProcessing';
import { 
  FileSpreadsheet, 
  Filter, 
  SortAsc, 
  Calculator, 
  FormInput, 
  Type, 
  Calendar, 
  LayoutGrid, 
  GitMerge, 
  Copy, 
  Loader2
} from 'lucide-react';
import { ProcessingNodeType } from '@/types/workflow';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

// Helper function to get the appropriate icon based on node type
function getNodeIcon(type: ProcessingNodeType) {
  switch (type) {
    case 'filtering':
      return <Filter className="h-4 w-4 text-blue-500" />;
    case 'sorting':
      return <SortAsc className="h-4 w-4 text-blue-500" />;
    case 'aggregation':
      return <Calculator className="h-4 w-4 text-blue-500" />;
    case 'formulaCalculation':
      return <FormInput className="h-4 w-4 text-blue-500" />;
    case 'textTransformation':
      return <Type className="h-4 w-4 text-blue-500" />;
    case 'dataTypeConversion':
      return <FileSpreadsheet className="h-4 w-4 text-blue-500" />;
    case 'dateFormatting':
      return <Calendar className="h-4 w-4 text-blue-500" />;
    case 'pivotTable':
      return <LayoutGrid className="h-4 w-4 text-blue-500" />;
    case 'joinMerge':
      return <GitMerge className="h-4 w-4 text-blue-500" />;
    case 'deduplication':
      return <Copy className="h-4 w-4 text-blue-500" />;
    default:
      return <FileSpreadsheet className="h-4 w-4 text-blue-500" />;
  }
}

function getNodeDescription(type: ProcessingNodeType) {
  switch (type) {
    case 'filtering':
      return 'Filter data based on conditions';
    case 'sorting':
      return 'Sort data by specific criteria';
    case 'aggregation':
      return 'Compute sums, averages, counts, etc.';
    case 'formulaCalculation':
      return 'Apply Excel-like formulas';
    case 'textTransformation':
      return 'Apply text operations';
    case 'dataTypeConversion':
      return 'Convert between data types';
    case 'dateFormatting':
      return 'Format date values';
    case 'pivotTable':
      return 'Create pivot tables';
    case 'joinMerge':
      return 'Combine multiple datasets';
    case 'deduplication':
      return 'Remove duplicate entries';
    default:
      return 'Process data';
  }
}

export default function DataProcessingNode({ id, data, selected }: { id: string; data: any; selected: boolean }) {
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  
  // Determine if this node requires a second input handle (for join/merge operations)
  const needsSecondInput = data.type === 'joinMerge';
  
  return (
    <Card className="w-[300px] shadow-md">
      <CardHeader className="bg-blue-50 py-2 flex flex-row items-center">
        <div className="p-1 rounded-md bg-blue-100">
          {getNodeIcon(data.type)}
        </div>
        <CardTitle className="text-sm font-medium ml-2">{data.label || 'Data Processing'}</CardTitle>
        {processing && (
          <Loader2 className="h-4 w-4 ml-auto animate-spin text-blue-500" />
        )}
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-gray-500">
            {getNodeDescription(data.type)}
          </div>
          
          {selected && (
            <div className="mt-2 p-2 bg-gray-50 rounded-md text-xs">
              <div className="font-medium mb-1">Operation:</div>
              <div className="text-blue-600">{data.type}</div>
              
              {data.config && Object.keys(data.config).length > 0 && (
                <div className="mt-2">
                  <div className="font-medium mb-1">Configuration:</div>
                  <div className="text-gray-600">
                    {Object.entries(data.config)
                      .filter(([key]) => key !== 'operation')
                      .map(([key, value]) => (
                        <div key={key} className="truncate">
                          <span className="font-medium">{key}:</span> {
                            typeof value === 'object' 
                              ? Array.isArray(value) 
                                ? value.join(', ') 
                                : JSON.stringify(value)
                              : String(value)
                          }
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {processingStatus && (
            <div className="mt-2 flex flex-col space-y-1">
              <div className="flex justify-between items-center">
                <Badge variant={
                  processingStatus === 'completed' ? 'success' as any : 
                  (processingStatus === 'failed' || processingStatus === 'error') ? 'destructive' : 
                  'secondary'
                } className="text-xs">
                  {processingStatus === 'completed' ? 'Processed' : 
                   (processingStatus === 'failed' || processingStatus === 'error') ? 'Failed' : 
                   'Processing'}
                </Badge>
                <span className="text-xs text-gray-500">{processingProgress}%</span>
              </div>
              <Progress value={processingProgress} className="h-1 w-full" />
              {processingError && (
                <p className="text-xs text-red-500 mt-1">{processingError}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
      
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-blue-500"
      />
      
      {/* Second input handle for join/merge operations */}
      {needsSecondInput && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-2 h-2 !bg-green-500"
          id="secondary"
          style={{ left: '70%' }}
        />
      )}
      
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-blue-500"
      />
    </Card>
  );
}
