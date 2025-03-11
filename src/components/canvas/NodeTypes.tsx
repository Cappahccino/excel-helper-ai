
import { ExpandableNode } from '@/components/workflow/nodes/ExpandableNode';
import { FilterNode } from '@/components/workflow/nodes/FilterNode';
import { SpreadsheetGeneratorNode } from '@/components/workflow/nodes/SpreadsheetGeneratorNode';
import { AINode } from '@/components/workflow/nodes/AINode';
import { AskAINode } from '@/components/workflow/nodes/AskAINode';
import { DataInputNode } from '@/components/workflow/nodes/DataInputNode';
import { DataProcessingNode } from '@/components/workflow/nodes/DataProcessingNode';
import { OutputNode } from '@/components/workflow/nodes/OutputNode';
import { IntegrationNode } from '@/components/workflow/nodes/IntegrationNode';
import { ControlNode } from '@/components/workflow/nodes/ControlNode';
import { UtilityNode } from '@/components/workflow/nodes/UtilityNode';
import { FileUploadNode } from '@/components/workflow/nodes/FileUploadNode';

// Node types mapping
export const nodeTypes = {
  dataInput: DataInputNode,
  dataProcessing: DataProcessingNode,
  filtering: FilterNode,
  aiNode: AINode,
  askAI: AskAINode,
  outputNode: OutputNode,
  integrationNode: IntegrationNode,
  controlNode: ControlNode,
  utilityNode: UtilityNode,
  fileUpload: FileUploadNode,
  spreadsheetGenerator: SpreadsheetGeneratorNode,
  expandable: ExpandableNode,
};

// Get node types function (used by CanvasFlow)
export const getNodeTypes = () => nodeTypes;
