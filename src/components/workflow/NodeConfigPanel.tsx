
import React from 'react';
import { NodeConfigPanelProps, AINodeData, ProcessingNodeType, SpreadsheetGeneratorNodeData } from '@/types/workflow';
import SpreadsheetGeneratorNodeConfig from './SpreadsheetGeneratorNodeConfig';
import AskAINodeConfig from './AskAINodeConfig';
import { DataProcessingNodeConfig } from './DataProcessingNodeConfig';

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({ node, onConfigChange }) => {
  if (!node) {
    return null;
  }

  const renderNodeConfig = () => {
    const { type } = node.data;
    
    switch (type) {
      case 'askAI':
        return (
          <AskAINodeConfig 
            aiConfig={node.data.config}
            onUpdate={(updatedConfig) => onConfigChange(updatedConfig)}
          />
        );
      
      case 'spreadsheetGenerator':
        return (
          <SpreadsheetGeneratorNodeConfig 
            spreadsheetConfig={node.data.config as SpreadsheetGeneratorNodeData['config']}
            onUpdate={(updatedConfig) => onConfigChange(updatedConfig)}
          />
        );
        
      case 'dataProcessing':
      case 'filtering':
      case 'sorting':
      case 'transformation':
      case 'aggregation':
      case 'formulaCalculation':
      case 'textTransformation':
      case 'dataTypeConversion':
      case 'dateFormatting':
      case 'pivotTable':
      case 'joinMerge':
      case 'deduplication':
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
      </div>
      
      {renderNodeConfig()}
    </div>
  );
};

export default NodeConfigPanel;
