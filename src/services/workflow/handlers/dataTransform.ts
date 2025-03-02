// src/services/workflow/handlers/dataTransform.ts

import { NodeDefinition } from '@/types/workflow';
import _ from 'lodash';

interface DataTransformConfig {
  operations: Array<{
    type: 'map' | 'filter' | 'sort' | 'group' | 'aggregate' | 'join';
    config: Record<string, any>;
  }>;
}

export async function handleDataTransform(
  node: NodeDefinition,
  inputs: Record<string, any>,
  context: any
) {
  const config = node.data.config as DataTransformConfig;
  
  // Check if we have data to transform
  if (!inputs.data || !Array.isArray(inputs.data)) {
    throw new Error('No data provided for transformation');
  }
  
  let data = [...inputs.data];
  
  await context.logMessage(`Starting data transformation on ${data.length} rows`, 'info', node.id);
  
  // Apply each operation in sequence
  for (const operation of config.operations) {
    switch (operation.type) {
      case 'map':
        data = applyMapOperation(data, operation.config);
        break;
        
      case 'filter':
        data = applyFilterOperation(data, operation.config);
        break;
        
      case 'sort':
        data = applySortOperation(data, operation.config);
        break;
        
      case 'group':
        data = applyGroupOperation(data, operation.config);
        break;
        
      case 'aggregate':
        data = applyAggregateOperation(data, operation.config);
        break;
        
      case 'join':
        // For join operations, we need another dataset
        if (!inputs.secondaryData || !Array.isArray(inputs.secondaryData)) {
          throw new Error('Secondary data required for join operation');
        }
        data = applyJoinOperation(data, inputs.secondaryData, operation.config);
        break;
        
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }
  
  await context.logMessage(`Data transformation complete, produced ${data.length} rows`, 'info', node.id);
  
  return {
    data,
    rowCount: data.length,
    transformedAt: new Date().toISOString()
  };
}

// Implement transformation operations
function applyMapOperation(data: any[], config: any): any[] {
  const { mappings } = config;
  
  return data.map(row => {
    const newRow: Record<string, any> = {};
    
    for (const [targetField, mapping] of Object.entries(mappings)) {
      if (typeof mapping === 'string') {
        // Simple field mapping
        newRow[targetField] = row[mapping];
      } else if (typeof mapping === 'object' && mapping.formula) {
        // Formula evaluation (simplified example)
        try {
          // Use a formula evaluator in production instead of eval
          const formula = mapping.formula.replace(/\${([^}]+)}/g, (match, field) => {
            return JSON.stringify(row[field]);
          });
          
          // This is a placeholder for actual formula evaluation
          // In production, use a proper formula parser
          newRow[targetField] = evaluateFormula(formula, row);
        } catch (error) {
          newRow[targetField] = null;
        }
      }
    }
    
    return newRow;
  });
}

function applyFilterOperation(data: any[], config: any): any[] {
  const { conditions, operator = 'and' } = config;
  
  return data.filter(row => {
    const results = conditions.map((condition: any) => {
      const { field, operator, value } = condition;
      const fieldValue = row[field];
      
      switch (operator) {
        case 'equals': return fieldValue === value;
        case 'notEquals': return fieldValue !== value;
        case 'contains': return String(fieldValue).includes(String(value));
        case 'greaterThan': return fieldValue > value;
        case 'lessThan': return fieldValue < value;
        case 'isEmpty': return fieldValue === null || fieldValue === undefined || fieldValue === '';
        case 'isNotEmpty': return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
        default: return false;
      }
    });
    
    return operator === 'and' 
      ? results.every(Boolean) 
      : results.some(Boolean);
  });
}

function applySortOperation(data: any[], config: any): any[] {
  const { sortBy } = config;
  
  return _.orderBy(
    data,
    sortBy.map((sort: any) => sort.field),
    sortBy.map((sort: any) => sort.direction === 'desc' ? 'desc' : 'asc')
  );
}

function applyGroupOperation(data: any[], config: any): any[] {
  const { groupBy } = config;
  
  const groups = _.groupBy(data, (row) => {
    // Create a compound key based on all groupBy fields
    return groupBy.map((field: string) => String(row[field])).join('|');
  });
  
  return Object.entries(groups).map(([key, rows]) => {
    const keyParts = key.split('|');
    const result: Record<string, any> = {};
    
    // Add the group keys to the result
    groupBy.forEach((field: string, index: number) => {
      result[field] = keyParts[index];
    });
    
    // Add the group data
    result.group = rows;
    result.count = rows.length;
    
    return result;
  });
}

function applyAggregateOperation(data: any[], config: any): any[] {
  const { aggregations } = config;
  
  // If data is already grouped
  if (data.some(row => row.group && Array.isArray(row.group))) {
    return data.map(group => {
      const result = { ...group };
      
      for (const agg of aggregations) {
        const { field, function: func, outputField } = agg;
        
        switch (func) {
          case 'sum':
            result[outputField] = _.sumBy(group.group, (row) => Number(row[field]) || 0);
            break;
            
          case 'avg':
            result[outputField] = _.meanBy(group.group, (row) => Number(row[field]) || 0);
            break;
            
          case 'min':
            result[outputField] = _.minBy(group.group, (row) => Number(row[field]) || 0)?.[field] || 0;
            break;
            
          case 'max':
            result[outputField] = _.maxBy(group.group, (row) => Number(row[field]) || 0)?.[field] || 0;
            break;
            
          case 'count':
            result[outputField] = group.group.length;
            break;
        }
      }
      
      return result;
    });
  }
  
  // If no grouping, apply to entire dataset
  const result: Record<string, any> = {};
  
  for (const agg of aggregations) {
    const { field, function: func, outputField } = agg;
    
    switch (func) {
      case 'sum':
        result[outputField] = _.sumBy(data, (row) => Number(row[field]) || 0);
        break;
        
      case 'avg':
        result[outputField] = _.meanBy(data, (row) => Number(row[field]) || 0);
        break;
        
      case 'min':
        result[outputField] = _.minBy(data, (row) => Number(row[field]) || 0)?.[field] || 0;
        break;
        
      case 'max':
        result[outputField] = _.maxBy(data, (row) => Number(row[field]) || 0)?.[field] || 0;
        break;
        
      case 'count':
        result[outputField] = data.length;
        break;
    }
  }
  
  return [result];
}

function applyJoinOperation(leftData: any[], rightData: any[], config: any): any[] {
  const { leftField, rightField, type = 'inner', includeFields = [] } = config;
  
  // Create a map of right data by join field for faster lookup
  const rightMap = new Map();
  for (const rightRow of rightData) {
    const key = String(rightRow[rightField]);
    if (!rightMap.has(key)) {
      rightMap.set(key, []);
    }
    rightMap.get(key).push(rightRow);
  }
  
  const result: any[] = [];
  
  // Perform the join based on the specified type
  switch (type) {
    case 'inner':
      // Inner join - only rows with matches in both datasets
      for (const leftRow of leftData) {
        const leftKey = String(leftRow[leftField]);
        const rightRows = rightMap.get(leftKey) || [];
        
        for (const rightRow of rightRows) {
          const joinedRow = { ...leftRow };
          
          // Add specified fields from right side
          for (const field of includeFields) {
            joinedRow[field] = rightRow[field];
          }
          
          result.push(joinedRow);
        }
      }
      break;
      
    case 'left':
      // Left join - all rows from left dataset, with matches from right where available
      for (const leftRow of leftData) {
        const leftKey = String(leftRow[leftField]);
        const rightRows = rightMap.get(leftKey) || [];
        
        if (rightRows.length > 0) {
          // Left row has matches on the right
          for (const rightRow of rightRows) {
            const joinedRow = { ...leftRow };
            
            // Add specified fields from right side
            for (const field of includeFields) {
              joinedRow[field] = rightRow[field];
            }
            
            result.push(joinedRow);
          }
        } else {
          // No matches on right - include left row with nulls for right fields
          const joinedRow = { ...leftRow };
          
          // Add specified fields from right side as null
          for (const field of includeFields) {
            joinedRow[field] = null;
          }
          
          result.push(joinedRow);
        }
      }
      break;
      
    case 'right':
      // Right join - all rows from right dataset, with matches from left where available
      const leftMap = new Map();
      for (const leftRow of leftData) {
        const key = String(leftRow[leftField]);
        if (!leftMap.has(key)) {
          leftMap.set(key, []);
        }
        leftMap.get(key).push(leftRow);
      }
      
      for (const rightRow of rightData) {
        const rightKey = String(rightRow[rightField]);
        const leftRows = leftMap.get(rightKey) || [];
        
        if (leftRows.length > 0) {
          // Right row has matches on the left
          for (const leftRow of leftRows) {
            const joinedRow = { ...leftRow };
            
            // Add specified fields from right side
            for (const field of includeFields) {
              joinedRow[field] = rightRow[field];
            }
            
            result.push(joinedRow);
          }
        } else {
          // No matches on left - create a row with nulls for left fields and right values
          const joinedRow: Record<string, any> = {};
          
          // Add all fields from right side
          for (const field of includeFields) {
            joinedRow[field] = rightRow[field];
          }
          
          // Add left dataset fields as null
          for (const key of Object.keys(leftData[0] || {})) {
            if (!(key in joinedRow)) {
              joinedRow[key] = null;
            }
          }
          
          result.push(joinedRow);
        }
      }
      break;
      
    case 'full':
      // Full outer join - all rows from both datasets
      // First, do a left join
      const leftJoin = applyJoinOperation(leftData, rightData, { ...config, type: 'left' });
      
      // Then add right rows that don't have a match on the left
      const leftKeys = new Set(leftData.map(row => String(row[leftField])));
      
      for (const rightRow of rightData) {
        const rightKey = String(rightRow[rightField]);
        
        if (!leftKeys.has(rightKey)) {
          // This right row doesn't have a match on the left
          const joinedRow: Record<string, any> = {};
          
          // Add specified fields from right side
          for (const field of includeFields) {
            joinedRow[field] = rightRow[field];
          }
          
          // Add left dataset fields as null
          for (const key of Object.keys(leftData[0] || {})) {
            if (!(key in joinedRow)) {
              joinedRow[key] = null;
            }
          }
          
          leftJoin.push(joinedRow);
        }
      }
      
      return leftJoin;
  }
  
  return result;
}

// Safe formula evaluator - in production you'd use a proper formula parser
function evaluateFormula(formula: string, row: any): any {
  // This is a placeholder for a proper formula evaluator
  // In production, you would use a library like mathjs or create your own parser
  try {
    // Very simplified evaluation for demo purposes
    // Replace with a proper formula parser in production!
    const safeFormula = formula.replace(/[^0-9+\-*/.()\s]/g, '');
    return eval(safeFormula);
  } catch (e) {
    console.warn('Formula evaluation failed:', e);
    return null;
  }
}

// Function to apply a formula to a data set
export const applyFormula = async (
  inputs: NodeInputs,
  config: Record<string, any>
): Promise<NodeOutputs> => {
  const inputData = inputs.data || [];
  
  if (!Array.isArray(inputData) || inputData.length === 0) {
    return { data: [] };
  }
  
  try {
    // Get the formula from the config
    const formula = config.formula as string;
    
    if (!formula) {
      return { data: inputData }; // Return original data if no formula
    }
    
    // Apply the formula to each row
    const newData = inputData.map(row => {
      const newRow: Record<string, any> = {};
      
      for (const [targetField, mapping] of Object.entries(config.mappings)) {
        if (typeof mapping === 'string') {
          // Simple field mapping
          newRow[targetField] = row[mapping];
        } else if (typeof mapping === 'object' && mapping.formula) {
          // Formula evaluation (simplified example)
          try {
            // Use a formula evaluator in production instead of eval
            const formula = mapping.formula.replace(/\${([^}]+)}/g, (match, field) => {
              return JSON.stringify(row[field]);
            });
            
            // This is a placeholder for actual formula evaluation
            // In production, use a proper formula parser
            newRow[targetField] = evaluateFormula(formula, row);
          } catch (error) {
            newRow[targetField] = null;
          }
        }
      }
      
      return newRow;
    });
    
    return { data: newData };
  } catch (error) {
    console.error('Error applying formula:', error);
    throw new Error(`Formula execution error: ${error}`);
  }
};
