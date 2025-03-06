
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
  
  // Determine if this node requires a second input handle (for join/merge operations)
  const needsSecondInput = data.type === 'joinMerge';
  
  return (
    <div className={`rounded-md border ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'} bg-white shadow-sm`}>
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-blue-500"
      />
      
      {/* Second input handle for join/merge operations */}
      {needsSecondInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-green-500"
          id="secondary"
          style={{ top: '70%' }}
        />
      )}
      
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-blue-500"
      />
      
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-md bg-blue-100">
            {getNodeIcon(data.type)}
          </div>
          <div>
            <div className="font-medium text-sm">{data.label || 'Data Processing'}</div>
            <div className="text-xs text-gray-500">{getNodeDescription(data.type)}</div>
          </div>
          {processing && (
            <Loader2 className="h-4 w-4 ml-auto animate-spin text-blue-500" />
          )}
        </div>
        
        {selected && (
          <div className="mt-2 p-2 bg-gray-50 rounded-md text-xs">
            <div className="font-medium mb-1">Operation:</div>
            <div className="text-blue-600">{data.type}</div>
            
            {data.config && Object.keys(data.config).length > 0 && (
              <div className="mt-2">
                <div className="font-medium mb-1">Configuration:</div>
                <div className="text-gray-600 truncate">
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
      </div>
    </div>
  );
}
