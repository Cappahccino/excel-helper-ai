
import AINode from '@/components/workflow/nodes/AINode';
import AskAINode from '@/components/workflow/nodes/AskAINode';
import DataInputNode from '@/components/workflow/nodes/DataInputNode';
import DataProcessingNode from '@/components/workflow/nodes/DataProcessingNode';
import OutputNode from '@/components/workflow/nodes/OutputNode';
import IntegrationNode from '@/components/workflow/nodes/IntegrationNode';
import ControlNode from '@/components/workflow/nodes/ControlNode';
import SpreadsheetGeneratorNode from '@/components/workflow/nodes/SpreadsheetGeneratorNode';
import UtilityNode from '@/components/workflow/nodes/UtilityNode';
import FileUploadNode from '@/components/workflow/nodes/FileUploadNode';
import { NodeTypes } from '@xyflow/react';

export const nodeTypes: NodeTypes = {
  dataInput: DataInputNode,
  dataProcessing: DataProcessingNode,
  aiNode: AINode,
  askAI: AskAINode,
  outputNode: OutputNode,
  integrationNode: IntegrationNode,
  controlNode: ControlNode,
  spreadsheetGenerator: SpreadsheetGeneratorNode,
  utilityNode: UtilityNode,
  fileUpload: FileUploadNode,
};

export const getNodeTypes = (handleNodeConfigUpdate: (nodeId: string, config: any) => void, workflowId: string | null) => ({
  dataInput: DataInputNode,
  dataProcessing: (props: any) => <DataProcessingNode {...props} onConfigChange={handleNodeConfigUpdate} />,
  aiNode: AINode,
  askAI: (props: any) => <AskAINode {...props} onConfigChange={handleNodeConfigUpdate} />,
  outputNode: OutputNode,
  integrationNode: IntegrationNode,
  controlNode: ControlNode,
  spreadsheetGenerator: (props: any) => <SpreadsheetGeneratorNode {...props} onConfigChange={handleNodeConfigUpdate} />,
  utilityNode: UtilityNode,
  fileUpload: (props: any) => <FileUploadNode 
    {...{
      ...props,
      data: {
        ...props.data,
        workflowId: workflowId,
        onChange: handleNodeConfigUpdate
      }
    }} 
  />,
});
