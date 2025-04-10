
import React from 'react';
import { X, Trash, Copy, ChevronRight } from 'lucide-react';
import { NodeConfigPanelProps, WorkflowNode, AINodeData, SpreadsheetGeneratorNodeData, ProcessingNodeType } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import AskAINodeConfig from './AskAINodeConfig';
import SpreadsheetGeneratorNodeConfig from './SpreadsheetGeneratorNodeConfig';
import { DataProcessingNodeConfig } from './DataProcessingNodeConfig';

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  node,
  onUpdateConfig,
  onDelete,
  onDuplicate,
  onClose,
  readOnly = false,
}) => {
  const isAskAINode = node.type === 'askAI';
  const isSpreadsheetGeneratorNode = node.type === 'spreadsheetGenerator';
  
  const handleUpdate = (updatedData: any) => {
    if (!node) return;
    
    if (isAskAINode) {
      const aiNodeData = node.data as AINodeData;
      
      const updatedConfig = {
        ...aiNodeData.config,
        ...(updatedData || {})
      };
      
      onUpdateConfig(updatedConfig);
    } else {
      onUpdateConfig({
        ...node.data.config,
        ...(updatedData || {})
      });
    }
  };
  
  const renderConfig = () => {
    switch (node.type) {
      case 'askAI':
        return (
          <AskAINodeConfig
            data={node.data as AINodeData}
            onUpdate={handleUpdate}
          />
        );
      
      case 'spreadsheetGenerator':
        return (
          <SpreadsheetGeneratorNodeConfig
            node={{
              id: node.id as string,
              data: node.data as SpreadsheetGeneratorNodeData
            }}
            onConfigChange={(nodeId, config) => onUpdateConfig(config)}
          />
        );
      
      default:
        return (
          <div className="p-4">
            <p className="text-center text-gray-500">
              Configuration options for {node.data.label || node.type} will appear here.
            </p>
          </div>
        );
    }
  };

  const renderConfigPanel = () => {
    const processingNodeTypes: ProcessingNodeType[] = [
      'filtering', 'sorting', 'aggregation', 'formulaCalculation', 
      'textTransformation', 'dataTypeConversion', 'dateFormatting', 
      'pivotTable', 'joinMerge', 'deduplication'
    ];
    
    if (processingNodeTypes.includes(node.data.type as ProcessingNodeType)) {
      return (
        <DataProcessingNodeConfig
          nodeId={node.id}
          config={node.data.config}
          type={node.data.type as ProcessingNodeType}
          onConfigChange={handleUpdate}
        />
      );
    }

    return renderConfig();
  };

  return (
    <div className="w-80 min-w-80 border-l border-gray-200 bg-white flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <div className="flex items-center">
          <span className="font-medium">Node Configuration</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="p-4 border-b border-gray-200">
        <div className="text-sm font-medium">{node.data?.label || 'Unnamed Node'}</div>
        <div className="text-xs text-gray-500">Type: {node.type}</div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {renderConfigPanel()}
      </div>
      
      {!readOnly && (
        <div className="border-t border-gray-200 p-4 space-y-2">
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              className="flex-1"
              onClick={onDuplicate}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              className="flex-1"
              onClick={onDelete}
            >
              <Trash className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NodeConfigPanel;
