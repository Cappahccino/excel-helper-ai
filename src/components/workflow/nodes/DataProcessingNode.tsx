
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

// Helper function to get the appropriate icon based on node type
function getNodeIcon(type: ProcessingNodeType) {
  switch (type) {
    case 'filtering':
      return <Filter className="h-4 w-4" />;
    case 'sorting':
      return <SortAsc className="h-4 w-4" />;
    case 'aggregation':
      return <Calculator className="h-4 w-4" />;
    case 'formulaCalculation':
      return <FormInput className="h-4 w-4" />;
    case 'textTransformation':
      return <Type className="h-4 w-4" />;
    case 'dataTypeConversion':
      return <FileSpreadsheet className="h-4 w-4" />;
    case 'dateFormatting':
      return <Calendar className="h-4 w-4" />;
    case 'pivotTable':
      return <LayoutGrid className="h-4 w-4" />;
    case 'joinMerge':
      return <GitMerge className="h-4 w-4" />;
    case 'deduplication':
      return <Copy className="h-4 w-4" />;
    default:
      return <FileSpreadsheet className="h-4 w-4" />;
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
  const { isProcessing } = useDataProcessing();
  
  // Determine if this node requires a second input handle (for join/merge operations)
  const needsSecondInput = data.type === 'joinMerge';
  const nodeLabel = data?.label || 'Data Processing';

  return (
    <Card className="w-[300px] shadow-md">
      <CardHeader className="bg-blue-50 py-2 flex flex-row items-center">
        <div className="p-1 rounded-md bg-blue-100">
          {getNodeIcon(data.type)}
        </div>
        <CardTitle className="text-sm font-medium ml-2">{nodeLabel}</CardTitle>
        {processing && (
          <Loader2 className="h-4 w-4 ml-auto animate-spin text-blue-500" />
        )}
      </CardHeader>
      
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-gray-600">
            {getNodeDescription(data.type)}
          </div>
          
          {selected && (
            <div className="border rounded p-2 bg-gray-50">
              <div className="font-medium text-xs mb-1">Configuration:</div>
              {data.config && Object.keys(data.config).length > 0 ? (
                <div className="text-xs">
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
              ) : (
                <div className="text-xs text-muted-foreground">No configuration set</div>
              )}
            </div>
          )}
          
          {isProcessing && (
            <div className="mt-2 flex flex-col space-y-1">
              <div className="flex justify-between items-center">
                <Badge variant="secondary" className="flex items-center text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Processing
                </Badge>
                <span className="text-xs text-gray-500">{processingProgress}%</span>
              </div>
              <Progress value={processingProgress} className="h-1 w-full" />
            </div>
          )}
        </div>
      </CardContent>
      
      {/* Input handle at the top */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-blue-500"
      />
      
      {/* Second input handle for join/merge operations */}
      {needsSecondInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-2 h-2 !bg-green-500"
          id="secondary"
        />
      )}
      
      {/* Output handle at the bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-blue-500"
      />
    </Card>
  );
}
