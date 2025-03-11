
import React from 'react';
import { NodeConfigPanelProps, ProcessingNodeType } from '@/types/workflow';
import SpreadsheetGeneratorNodeConfig from './SpreadsheetGeneratorNodeConfig';
import AskAINodeConfig from './AskAINodeConfig';
import DataProcessingNodeConfig from './DataProcessingNodeConfig';

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({ 
  node, 
  onConfigChange,
  onUpdateConfig,
  onDelete,
  onDuplicate,
  onClose,
  readOnly 
}) => {
  if (!node) {
    return null;
  }

  const renderNodeConfig = () => {
    const { type } = node.data;
    
    switch (type) {
      case 'askAI':
        return (
          <AskAINodeConfig 
            config={node.data.config}
            onConfigChange={(updatedConfig) => onConfigChange(updatedConfig)}
          />
        );
      
      case 'spreadsheetGenerator':
        return (
          <SpreadsheetGeneratorNodeConfig 
            config={node.data.config}
            onConfigChange={(updatedConfig) => onConfigChange(updatedConfig)}
          />
        );
        
      case 'dataProcessing':
      case 'filtering':
      case 'sorting':
      case 'transformation':
      case 'aggregation' as ProcessingNodeType:
      case 'formulaCalculation' as ProcessingNodeType:
      case 'textTransformation' as ProcessingNodeType:
      case 'dataTypeConversion' as ProcessingNodeType:
      case 'dateFormatting' as ProcessingNodeType:
      case 'pivotTable' as ProcessingNodeType:
      case 'joinMerge' as ProcessingNodeType:
      case 'deduplication' as ProcessingNodeType:
        return (
          <DataProcessingNodeConfig 
            config={node.data.config}
            onConfigChange={(updatedConfig) => onConfigChange(updatedConfig)}
          />
        );
      
      default:
        return (
          <div className="p-4">
            <p>No configuration panel available for this node type: {type}</p>
          </div>
        );
    }
  };

  return (
    <div className="p-4 border-l border-gray-200 bg-white h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">{node.data.label} Configuration</h2>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            &times;
          </button>
        )}
      </div>
      
      {renderNodeConfig()}
      
      {!readOnly && (
        <div className="mt-6 flex space-x-2">
          {onDelete && (
            <button 
              onClick={onDelete}
              className="px-3 py-1 bg-red-50 text-red-600 text-sm rounded hover:bg-red-100"
            >
              Delete Node
            </button>
          )}
          
          {onDuplicate && (
            <button 
              onClick={onDuplicate}
              className="px-3 py-1 bg-blue-50 text-blue-600 text-sm rounded hover:bg-blue-100"
            >
              Duplicate
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default NodeConfigPanel;
