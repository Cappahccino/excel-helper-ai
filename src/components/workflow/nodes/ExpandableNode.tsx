
import React, { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';

interface ExpandableNodeProps {
  data: {
    label: string;
    children?: React.ReactNode;
  };
  selected?: boolean;
}

const ExpandableNode: React.FC<ExpandableNodeProps> = ({ data, selected }) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  return (
    <div className={`relative p-0 border-2 ${selected ? 'border-gray-500 shadow-md' : 'border-gray-200'} rounded-lg`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-t-lg drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-gray-500 opacity-50" />
        <button 
          className="p-1 rounded hover:bg-gray-200 focus:outline-none" 
          onClick={toggleExpanded}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-700" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-700" />
          )}
        </button>
        <div className="text-sm font-medium text-gray-800">{data.label}</div>
      </div>
      
      {/* Content (only visible when expanded) */}
      {expanded && (
        <div className="p-3 pt-2 bg-white rounded-b-lg">
          {data.children || (
            <div className="text-xs text-gray-500 italic">
              Empty container node. Drag nodes inside.
            </div>
          )}
        </div>
      )}
      
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
          background: '#64748b',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(ExpandableNode);
