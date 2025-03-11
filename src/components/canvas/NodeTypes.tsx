import { ExpandableNode } from '@/components/workflow/nodes/ExpandableNode';
import { FilterNode } from '@/components/workflow/nodes/FilterNode';

export const nodeTypes = {
  dataInput: ExpandableNode,
  dataProcessing: ExpandableNode, 
  filtering: FilterNode,
  aiNode: ExpandableNode,
  outputNode: ExpandableNode,
  integrationNode: ExpandableNode,
  controlNode:ExpandableNode,
  utilityNode: ExpandableNode,
  fileUpload: ExpandableNode,
  spreadsheetGenerator: ExpandableNode,
  askAI: ExpandableNode
};
