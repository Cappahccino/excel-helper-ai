// src/components/workflow/nodes/DataInputNode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Database, GripVertical } from 'lucide-react';

const DataInputNode = ({ data, selected }: NodeProps) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-blue-500 shadow-md' : 'border-blue-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-blue-500 opacity-50" />
        <Database className="h-4 w-4 text-blue-500" />
        <div className="text-sm font-medium text-blue-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Input type specific display */}
        {data.type === 'excelInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>File:</span>
              <span className="font-medium">{data.config?.fileId ? 'Selected' : 'Not selected'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Headers:</span>
              <span className="font-medium">{data.config?.hasHeaders ? 'Yes' : 'No'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'csvInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>File:</span>
              <span className="font-medium">{data.config?.fileId ? 'Selected' : 'Not selected'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Delimiter:</span>
              <span className="font-medium">{data.config?.delimiter || ','}</span>
            </div>
          </div>
        )}
        
        {data.type === 'apiSource' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>API Endpoint:</span>
              <span className="font-medium">{data.config?.endpoint ? 'Configured' : 'Not set'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'userInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Form fields:</span>
              <span className="font-medium">{data.config?.fields?.length || 0}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Output handle - bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        style={{
          background: '#27B67A',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(DataInputNode);

// src/components/workflow/nodes/DataProcessingNode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Table, GripVertical } from 'lucide-react';

const DataProcessingNode = ({ data, selected }: NodeProps) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-green-500 shadow-md' : 'border-green-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-green-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-green-500 opacity-50" />
        <Table className="h-4 w-4 text-green-500" />
        <div className="text-sm font-medium text-green-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Process type specific display */}
        {data.type === 'dataTransform' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Operations:</span>
              <span className="font-medium">{data.config?.operations?.length || 0}</span>
            </div>
          </div>
        )}
        
        {data.type === 'dataCleaning' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Cleaning rules:</span>
              <span className="font-medium">{data.config?.rules?.length || 0}</span>
            </div>
          </div>
        )}
        
        {data.type === 'formulaNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Formula:</span>
              <span className="font-medium">{data.config?.formula ? 'Set' : 'Not set'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'filterNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Conditions:</span>
              <span className="font-medium">{data.config?.conditions?.length || 0}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Input handle - top center */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        style={{
          background: '#94a3b8',
          width: 10,
          height: 10,
          top: -5,
        }}
      />
      
      {/* Output handle - bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        style={{
          background: '#27B67A',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(DataProcessingNode);

// src/components/workflow/nodes/AINode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Zap, GripVertical } from 'lucide-react';

const AINode = ({ data, selected }: NodeProps) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-purple-500 shadow-md' : 'border-purple-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-purple-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-purple-500 opacity-50" />
        <Zap className="h-4 w-4 text-purple-500" />
        <div className="text-sm font-medium text-purple-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* AI type specific display */}
        {data.type === 'aiAnalyze' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Analysis type:</span>
              <span className="font-medium">{data.config?.analysisOptions?.detectOutliers ? 'Outlier detection' : 'Standard'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'aiClassify' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Categories:</span>
              <span className="font-medium">{data.config?.classificationOptions?.categories?.length || 0}</span>
            </div>
          </div>
        )}
        
        {data.type === 'aiSummarize' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Custom prompt:</span>
              <span className="font-medium">{data.config?.prompt ? 'Yes' : 'No'}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Input handle - top center */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        style={{
          background: '#94a3b8',
          width: 10,
          height: 10,
          top: -5,
        }}
      />
      
      {/* Output handle - bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        style={{
          background: '#27B67A',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(AINode);

// src/components/workflow/nodes/IntegrationNode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileSearch, GripVertical } from 'lucide-react';

const IntegrationNode = ({ data, selected }: NodeProps) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-orange-500 shadow-md' : 'border-orange-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-orange-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-orange-500 opacity-50" />
        <FileSearch className="h-4 w-4 text-orange-500" />
        <div className="text-sm font-medium text-orange-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Integration type specific display */}
        {data.type === 'xeroConnect' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Operation:</span>
              <span className="font-medium">{data.config?.operation || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Auth status:</span>
              <span className="font-medium">{data.config?.credentials ? 'Connected' : 'Not connected'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'salesforceConnect' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Operation:</span>
              <span className="font-medium">{data.config?.operation || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Auth status:</span>
              <span className="font-medium">{data.config?.credentials ? 'Connected' : 'Not connected'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'googleSheetsConnect' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Operation:</span>
              <span className="font-medium">{data.config?.operation || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Sheet ID:</span>
              <span className="font-medium">{data.config?.spreadsheetId ? 'Set' : 'Not set'}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Input handle - top center */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        style={{
          background: '#94a3b8',
          width: 10,
          height: 10,
          top: -5,
        }}
      />
      
      {/* Output handle - bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        style={{
          background: '#27B67A',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(IntegrationNode);

// src/components/workflow/nodes/OutputNode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileText, GripVertical } from 'lucide-react';

const OutputNode = ({ data, selected }: NodeProps) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-red-500 shadow-md' : 'border-red-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-red-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-red-500 opacity-50" />
        <FileText className="h-4 w-4 text-red-500" />
        <div className="text-sm font-medium text-red-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Output type specific display */}
        {data.type === 'excelOutput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Filename:</span>
              <span className="font-medium">{data.config?.filename || 'output.xlsx'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Format:</span>
              <span className="font-medium">{data.config?.format || 'XLSX'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'dashboardOutput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Visualizations:</span>
              <span className="font-medium">{data.config?.visualizations?.length || 0}</span>
            </div>
          </div>
        )}
        
        {data.type === 'emailNotify' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Recipients:</span>
              <span className="font-medium">{data.config?.recipients?.length || 0}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Input handle - top center */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        style={{
          background: '#94a3b8',
          width: 10,
          height: 10,
          top: -5,
        }}
      />
    </div>
  );
};

export default memo(OutputNode);

// src/components/workflow/nodes/ControlNode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Edit2, GripVertical } from 'lucide-react';

const ControlNode = ({ data, selected }: NodeProps) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-gray-500 shadow-md' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-gray-500 opacity-50" />
        <Edit2 className="h-4 w-4 text-gray-500" />
        <div className="text-sm font-medium text-gray-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Control type specific display */}
        {data.type === 'conditionalBranch' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Conditions:</span>
              <span className="font-medium">{data.config?.conditions?.length || 0}</span>
            </div>
          </div>
        )}
        
        {data.type === 'loopNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Loop type:</span>
              <span className="font-medium">{data.config?.loopType || 'For each'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'mergeNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Merge strategy:</span>
              <span className="font-medium">{data.config?.mergeStrategy || 'Concatenate'}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Input handle - top center */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        style={{
          background: '#94a3b8',
          width: 10,
          height: 10,
          top: -5,
        }}
      />
      
      {/* Multiple output handles for control nodes */}
      {data.type === 'conditionalBranch' && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{
              background: '#27B67A',
              width: 10,
              height: 10,
              bottom: -5,
              left: 'calc(30% - 5px)',
            }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{
              background: '#ef4444',
              width: 10,
              height: 10,
              bottom: -5,
              left: 'calc(70% - 5px)',
            }}
          />
          <div className="absolute bottom-2 left-0 w-full flex justify-between px-6 text-[10px] text-gray-500">
            <span>True</span>
            <span>False</span>
          </div>
        </>
      )}
      
      {data.type !== 'conditionalBranch' && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="output"
          style={{
            background: '#27B67A',
            width: 10,
            height: 10,
            bottom: -5,
          }}
        />
      )}
    </div>
  );
};

export default memo(ControlNode);
