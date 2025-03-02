
import { NodeInputs, NodeOutputs, NodeTypeDefinition } from '@/types/workflow';

// Helper functions for data transformation

// Clean column names
function cleanColumnNames(data: any[]): any[] {
  if (!data || !Array.isArray(data) || data.length === 0) return [];
  
  return data.map(row => {
    const cleanedRow: Record<string, any> = {};
    
    Object.entries(row).forEach(([key, value]) => {
      // Replace spaces with underscores, remove special characters, convert to lowercase
      const cleanKey = key
        .replace(/\s+/g, '_')
        .replace(/[^\w_]/g, '')
        .toLowerCase();
      
      cleanedRow[cleanKey] = value;
    });
    
    return cleanedRow;
  });
}

// Handle missing values
function handleMissingValues(data: any[], options: { strategy: string; defaultValue?: any }): any[] {
  if (!data || !Array.isArray(data) || data.length === 0) return [];
  
  const { strategy, defaultValue = null } = options;
  
  return data.map(row => {
    const newRow: Record<string, any> = {};
    
    Object.entries(row).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        switch (strategy) {
          case 'remove':
            // Skip this entry
            break;
          case 'default':
            newRow[key] = defaultValue;
            break;
          case 'mean':
            // For now just use default, in reality would calculate mean from column
            newRow[key] = defaultValue;
            break;
          default:
            newRow[key] = value;
        }
      } else {
        newRow[key] = value;
      }
    });
    
    return newRow;
  });
}

// Apply formula to a column
function applyFormula(data: any[], formulaConfig: { column: string; formula: string }): any[] {
  if (!data || !Array.isArray(data) || data.length === 0) return [];
  
  const { column, formula } = formulaConfig;
  
  // Create a safe evaluation function
  const safeEval = (expr: string, row: Record<string, any>): any => {
    // Replace column references with actual values
    let evalExpr = expr;
    
    Object.keys(row).forEach(key => {
      const regex = new RegExp(`\\[${key}\\]`, 'g');
      const value = typeof row[key] === 'number' ? row[key] : `"${row[key]}"`;
      evalExpr = evalExpr.replace(regex, value);
    });
    
    try {
      // Using Function constructor is safer than eval
      // This is still not completely safe for user input
      // eslint-disable-next-line no-new-func
      return Function(`"use strict"; return (${evalExpr})`)();
    } catch (error) {
      console.error('Error evaluating formula:', error);
      return null;
    }
  };
  
  return data.map(row => {
    const newRow = { ...row };
    newRow[column] = safeEval(formula, row);
    return newRow;
  });
}

// Filter data based on conditions
function filterData(data: any[], conditions: { column: string; operator: string; value: any }[]): any[] {
  if (!data || !Array.isArray(data) || data.length === 0 || !conditions || conditions.length === 0) {
    return data || [];
  }
  
  return data.filter(row => {
    return conditions.every(condition => {
      const { column, operator, value } = condition;
      const rowValue = row[column];
      
      switch (operator) {
        case 'equals':
          return rowValue === value;
        case 'notEquals':
          return rowValue !== value;
        case 'greaterThan':
          return rowValue > value;
        case 'lessThan':
          return rowValue < value;
        case 'contains':
          return String(rowValue).includes(String(value));
        case 'startsWith':
          return String(rowValue).startsWith(String(value));
        case 'endsWith':
          return String(rowValue).endsWith(String(value));
        default:
          return true;
      }
    });
  });
}

// Handler functions for different node types

// Handle data transform node
export async function handleDataTransform(inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> {
  const data = inputs.data || [];
  
  if (!Array.isArray(data) || data.length === 0) {
    return { data: [] };
  }
  
  const operations = config.operations || [];
  let transformedData = [...data];
  
  for (const operation of operations) {
    const { type, ...params } = operation;
    
    switch (type) {
      case 'select_columns':
        // Select only specified columns
        const columns = params.columns || [];
        transformedData = transformedData.map(row => {
          const newRow: Record<string, any> = {};
          columns.forEach((col: string) => {
            if (col in row) {
              newRow[col] = row[col];
            }
          });
          return newRow;
        });
        break;
        
      case 'rename_columns':
        // Rename columns
        const renames = params.renames || {};
        transformedData = transformedData.map(row => {
          const newRow: Record<string, any> = { ...row };
          Object.entries(renames).forEach(([oldName, newName]) => {
            if (oldName in newRow) {
              newRow[newName as string] = newRow[oldName];
              delete newRow[oldName];
            }
          });
          return newRow;
        });
        break;
        
      case 'calculate':
        // Calculate new columns
        const calculations = params.calculations || [];
        transformedData = transformedData.map(row => {
          const newRow = { ...row };
          calculations.forEach((calc: { column: string; formula: string }) => {
            // For simplicity, just use the formula application function
            const result = applyFormula([row], { column: calc.column, formula: calc.formula });
            if (result.length > 0) {
              newRow[calc.column] = result[0][calc.column];
            }
          });
          return newRow;
        });
        break;
        
      default:
        // Unknown operation type
        console.warn(`Unknown operation type: ${type}`);
    }
  }
  
  return { data: transformedData };
}

// Handle data cleaning node
export async function handleDataCleaning(inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> {
  const data = inputs.data || [];
  
  if (!Array.isArray(data)) {
    return { data: [] };
  }
  
  const rules = config.rules || [];
  let cleanedData = [...data];
  
  for (const rule of rules) {
    const { type, ...params } = rule;
    
    switch (type) {
      case 'clean_column_names':
        cleanedData = cleanColumnNames(cleanedData);
        break;
        
      case 'handle_missing_values':
        cleanedData = handleMissingValues(cleanedData, params);
        break;
        
      case 'remove_duplicates':
        // Simple duplicate removal based on all columns
        const seen = new Set();
        cleanedData = cleanedData.filter(row => {
          const rowStr = JSON.stringify(row);
          if (seen.has(rowStr)) {
            return false;
          }
          seen.add(rowStr);
          return true;
        });
        break;
        
      case 'type_conversion':
        // Convert column types
        const conversions = params.conversions || [];
        cleanedData = cleanedData.map(row => {
          const newRow = { ...row };
          conversions.forEach((conv: { column: string; type: string }) => {
            if (conv.column in newRow) {
              const value = newRow[conv.column];
              
              switch (conv.type) {
                case 'number':
                  newRow[conv.column] = Number(value);
                  break;
                case 'string':
                  newRow[conv.column] = String(value);
                  break;
                case 'boolean':
                  newRow[conv.column] = Boolean(value);
                  break;
                case 'date':
                  newRow[conv.column] = new Date(value).toISOString();
                  break;
              }
            }
          });
          return newRow;
        });
        break;
    }
  }
  
  return { data: cleanedData };
}

// Handle formula node
export async function handleFormulaNode(inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> {
  const data = inputs.data || [];
  
  if (!Array.isArray(data)) {
    return { data: [] };
  }
  
  // Extract formula from config
  const { column = 'result', formula } = config;
  
  if (!formula) {
    return { data };
  }
  
  // Apply formula to data
  const transformedData = applyFormula(data, { column, formula });
  
  return { data: transformedData };
}

// Handle filter node
export async function handleFilterNode(inputs: NodeInputs, config: Record<string, any>): Promise<NodeOutputs> {
  const data = inputs.data || [];
  
  if (!Array.isArray(data)) {
    return { data: [] };
  }
  
  // Extract conditions from config
  const conditions = config.conditions || [];
  
  // Apply filters
  const filteredData = filterData(data, conditions);
  
  return { data: filteredData };
}
