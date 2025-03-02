
import { NodeHandler, NodeInputs, NodeOutputs } from '@/types/workflow';
import { NodeTypeDefinition } from '@/types/workflow';

// Helper functions
const parseFormula = (formula: string) => {
  try {
    // Simple formula parsing for demonstration
    // In a real implementation, this would be much more sophisticated
    // Replace field references with actual values from data
    return formula;
  } catch (error) {
    console.error('Error parsing formula:', error);
    return null;
  }
};

// Data transformation functions
const applyTransformations = (data: any[], operations: any[]) => {
  if (!Array.isArray(data) || !Array.isArray(operations) || operations.length === 0) {
    return data;
  }
  
  let transformedData = [...data];
  
  for (const operation of operations) {
    switch (operation.type) {
      case 'rename':
        transformedData = transformedData.map(item => {
          const newItem = {...item};
          if (operation.oldField && operation.newField) {
            newItem[operation.newField] = item[operation.oldField];
            delete newItem[operation.oldField];
          }
          return newItem;
        });
        break;
        
      case 'select':
        if (Array.isArray(operation.fields)) {
          transformedData = transformedData.map(item => {
            const newItem: Record<string, any> = {};
            operation.fields.forEach((field: string) => {
              if (field in item) {
                newItem[field] = item[field];
              }
            });
            return newItem;
          });
        }
        break;
        
      case 'calculate':
        transformedData = transformedData.map(item => {
          const newItem = {...item};
          if (operation.targetField && operation.formula) {
            try {
              // This is a simplified implementation
              // In a real app, you'd use a formula parser/evaluator
              let formula = operation.formula;
              for (const [key, value] of Object.entries(item)) {
                formula = formula.replace(new RegExp(`\\[${key}\\]`, 'g'), String(value));
              }
              // Very basic evaluation - in production, use a safe evaluator
              newItem[operation.targetField] = eval(formula);
            } catch (e) {
              console.error('Formula evaluation error:', e);
              newItem[operation.targetField] = null;
            }
          }
          return newItem;
        });
        break;
        
      default:
        // Unknown operation type
        console.warn(`Unknown operation type: ${operation.type}`);
    }
  }
  
  return transformedData;
};

// Data cleaning functions
const applyCleaningRules = (data: any[], rules: any[]) => {
  if (!Array.isArray(data) || !Array.isArray(rules) || rules.length === 0) {
    return data;
  }
  
  let cleanedData = [...data];
  
  for (const rule of rules) {
    switch (rule.type) {
      case 'removeNull':
        if (rule.field) {
          cleanedData = cleanedData.filter(item => item[rule.field] != null);
        }
        break;
        
      case 'trimWhitespace':
        if (rule.field) {
          cleanedData = cleanedData.map(item => {
            const newItem = {...item};
            if (typeof newItem[rule.field] === 'string') {
              newItem[rule.field] = newItem[rule.field].trim();
            }
            return newItem;
          });
        }
        break;
        
      case 'convertType':
        if (rule.field && rule.toType) {
          cleanedData = cleanedData.map(item => {
            const newItem = {...item};
            try {
              switch (rule.toType) {
                case 'number':
                  newItem[rule.field] = Number(newItem[rule.field]);
                  break;
                case 'string':
                  newItem[rule.field] = String(newItem[rule.field]);
                  break;
                case 'boolean':
                  newItem[rule.field] = Boolean(newItem[rule.field]);
                  break;
                case 'date':
                  newItem[rule.field] = new Date(newItem[rule.field]);
                  break;
              }
            } catch (e) {
              console.error('Type conversion error:', e);
            }
            return newItem;
          });
        }
        break;
        
      default:
        // Unknown rule type
        console.warn(`Unknown cleaning rule type: ${rule.type}`);
    }
  }
  
  return cleanedData;
};

// Formula application
const applyFormula = (data: any[], formula: string) => {
  if (!Array.isArray(data) || !formula) {
    return data;
  }
  
  try {
    // Parse the formula - this is a simplified implementation
    const parsedFormula = parseFormula(formula);
    if (!parsedFormula) {
      return data;
    }
    
    // Apply formula to each item
    return data.map(item => {
      try {
        // This is a simplified implementation
        // In a real app, you'd use a formula parser/evaluator
        let formulaStr = formula;
        for (const [key, value] of Object.entries(item)) {
          formulaStr = formulaStr.replace(new RegExp(`\\[${key}\\]`, 'g'), String(value));
        }
        // Very basic evaluation - in production, use a safe evaluator
        return eval(formulaStr);
      } catch (e) {
        console.error('Formula application error:', e);
        return item;
      }
    });
  } catch (error) {
    console.error('Formula processing error:', error);
    return data;
  }
};

// Filtering functions
const applyFilters = (data: any[], conditions: any[]) => {
  if (!Array.isArray(data) || !Array.isArray(conditions) || conditions.length === 0) {
    return data;
  }
  
  // Apply each condition as a filter
  return data.filter(item => {
    for (const condition of conditions) {
      if (!evaluateCondition(item, condition)) {
        return false;
      }
    }
    return true;
  });
};

const evaluateCondition = (item: any, condition: any) => {
  const { field, operator, value } = condition;
  
  if (!field || !operator) {
    return true; // Skip invalid conditions
  }
  
  const itemValue = item[field];
  
  switch (operator) {
    case 'equals':
      return itemValue === value;
    case 'notEquals':
      return itemValue !== value;
    case 'greaterThan':
      return itemValue > value;
    case 'lessThan':
      return itemValue < value;
    case 'contains':
      return String(itemValue).includes(String(value));
    case 'startsWith':
      return String(itemValue).startsWith(String(value));
    case 'endsWith':
      return String(itemValue).endsWith(String(value));
    case 'isNull':
      return itemValue === null || itemValue === undefined;
    case 'isNotNull':
      return itemValue !== null && itemValue !== undefined;
    case 'isTrue':
      return Boolean(itemValue) === true;
    case 'isFalse':
      return Boolean(itemValue) === false;
    default:
      console.warn(`Unknown operator: ${operator}`);
      return true;
  }
};

// Handler implementations
export const handleDataTransform = async (inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> => {
  try {
    const inputData = inputs.data || [];
    const operations = config.operations || [];
    
    const transformedData = applyTransformations(inputData, operations);
    
    return {
      data: transformedData
    };
  } catch (error) {
    console.error('[Data Transform] Error:', error);
    throw error;
  }
};

export const handleDataCleaning = async (inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> => {
  try {
    const inputData = inputs.data || [];
    const rules = config.rules || [];
    
    const cleanedData = applyCleaningRules(inputData, rules);
    
    return {
      data: cleanedData
    };
  } catch (error) {
    console.error('[Data Cleaning] Error:', error);
    throw error;
  }
};

export const handleFormulaNode = async (inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> => {
  try {
    const inputData = inputs.data || [];
    const formula = config.formula || '';
    
    const processedData = applyFormula(inputData, formula);
    
    return {
      data: processedData
    };
  } catch (error) {
    console.error('[Formula Node] Error:', error);
    throw error;
  }
};

export const handleFilterNode = async (inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> => {
  try {
    const inputData = inputs.data || [];
    const conditions = config.conditions || [];
    
    const filteredData = applyFilters(inputData, conditions);
    
    return {
      data: filteredData
    };
  } catch (error) {
    console.error('[Filter Node] Error:', error);
    throw error;
  }
};

// Export the node handlers
export const dataTransformHandler: NodeHandler = {
  execute: handleDataTransform
};

export const dataCleaningHandler: NodeHandler = {
  execute: handleDataCleaning
};

export const formulaNodeHandler: NodeHandler = {
  execute: handleFormulaNode
};

export const filterNodeHandler: NodeHandler = {
  execute: handleFilterNode
};
