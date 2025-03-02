import { NodeInputs, NodeOutputs } from '@/types/workflow';

export const dataTransformHandler = async (
  nodeId: string,
  data: any,
  inputs: NodeInputs,
  nodeConfig: any
): Promise<NodeOutputs> => {
  try {
    const { transformationType, sourceField, regex, replacement, targetField } = nodeConfig;

    if (!sourceField || !targetField) {
      console.warn(`Data Transform Node (${nodeId}): Source and target fields are required.`);
      return {};
    }

    let value = data[sourceField] || inputs[sourceField];

    if (value === undefined || value === null) {
      console.warn(`Data Transform Node (${nodeId}): Source field "${sourceField}" not found in data or inputs.`);
      return {};
    }

    let result;

    switch (transformationType) {
      case 'regex':
        if (!regex || !replacement) {
          console.warn(`Data Transform Node (${nodeId}): Regex and replacement are required for regex transformation.`);
          return {};
        }
        const regexObject = new RegExp(regex, 'g');
        result = value.toString().replace(regexObject, replacement.toString());
        break;
      case 'uppercase':
        result = value.toString().toUpperCase();
        break;
      case 'lowercase':
        result = value.toString().toLowerCase();
        break;
      case 'truncate':
        const maxLength = nodeConfig.maxLength || 10;
        result = value.toString().substring(0, maxLength);
        break;
      case 'default':
        const defaultValue = nodeConfig.defaultValue || '';
        result = value ? value : defaultValue;
        break;
      default:
        console.warn(`Data Transform Node (${nodeId}): Unknown transformation type "${transformationType}".`);
        return {};
    }

    return { [targetField]: result };

  } catch (error: any) {
    console.error(`Error in Data Transform Node (${nodeId}):`, error);
    return {};
  }
};

// Define NodeInputs and NodeOutputs types if they're missing
export interface NodeInputs {
  [key: string]: any;
}

export interface NodeOutputs {
  [key: string]: any;
}
