// src/services/workflow/handlers/excelInput.ts

import { NodeDefinition } from '@/types/workflow';
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';

interface ExcelInputConfig {
  fileId: string;
  sheet?: string;
  range?: string;
  hasHeaders?: boolean;
}

export async function handleExcelInput(
  node: NodeDefinition,
  inputs: Record<string, any>,
  context: any
) {
  const config = node.data.config as ExcelInputConfig;
  
  // Validate configuration
  if (!config.fileId) {
    throw new Error('No file ID provided');
  }
  
  // Log step
  await context.logMessage('Retrieving Excel file data', 'info', node.id);
  
  // Get file from storage
  const { data: fileRecord, error: fileError } = await supabase
    .from('excel_files')
    .select('*')
    .eq('id', config.fileId)
    .single();
    
  if (fileError || !fileRecord) {
    throw new Error(`File not found: ${fileError?.message || 'Unknown error'}`);
  }
  
  // Download the file
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('excel_files')
    .download(fileRecord.file_path);
    
  if (downloadError || !fileData) {
    throw new Error(`Failed to download file: ${downloadError?.message || 'Unknown error'}`);
  }
  
  // Parse Excel file
  const workbook = XLSX.read(await fileData.arrayBuffer(), { 
    type: 'array',
    cellDates: true
  });
  
  // Determine which sheet to use
  const sheetName = config.sheet || workbook.SheetNames[0];
  if (!workbook.SheetNames.includes(sheetName)) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`);
  }
  
  const worksheet = workbook.Sheets[sheetName];
  
  // Parse data with or without headers
  const parseOptions: XLSX.Sheet2JSONOpts = {
    header: config.hasHeaders ? 1 : undefined,
    range: config.range || undefined,
    defval: null,
  };
  
  const data = XLSX.utils.sheet_to_json(worksheet, parseOptions);
  
  // Return the parsed data
  await context.logMessage(`Successfully imported ${data.length} rows from Excel`, 'info', node.id);
  
  return {
    data,
    sheetName,
    rowCount: data.length,
    columnNames: config.hasHeaders ? Object.keys(data[0] || {}) : []
  };
}

// src/services/workflow/handlers/dataTransform.ts

import { NodeDefinition } from '@/types/workflow';

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
          // In a real implementation, you'd use a proper formula parser/evaluator
          // This is a simplified example using unsafe eval (not recommended for production)
          const formula = mapping.formula.replace(/\${([^}]+)}/g, (match, field) => {
            return JSON.stringify(row[field]);
          });
          
          // WARNING: Never use eval in production code
          // This is just an example - use a proper formula parser instead
          newRow[targetField] = eval(formula);
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
  
  return [...data].sort((a, b) => {
    for (const sort of sortBy) {
      const { field, direction = 'asc' } = sort;
      
      if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
      if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
    }
    
    return 0;
  });
}

function applyGroupOperation(data: any[], config: any): any[] {
  const { groupBy } = config;
  
  const groups: Record<string, any[]> = {};
  
  for (const row of data) {
    // Create a compound key for the group
    const key = groupBy.map((field: string) => String(row[field])).join('|');
    
    if (!groups[key]) {
      groups[key] = [];
    }
    
    groups[key].push(row);
  }
  
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
            result[outputField] = group.group.reduce((sum: number, row: any) => sum + (Number(row[field]) || 0), 0);
            break;
            
          case 'avg':
            const sum = group.group.reduce((sum: number, row: any) => sum + (Number(row[field]) || 0), 0);
            result[outputField] = sum / group.group.length;
            break;
            
          case 'min':
            result[outputField] = Math.min(...group.group.map((row: any) => Number(row[field]) || 0));
            break;
            
          case 'max':
            result[outputField] = Math.max(...group.group.map((row: any) => Number(row[field]) || 0));
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
        result[outputField] = data.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
        break;
        
      case 'avg':
        const sum = data.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
        result[outputField] = sum / data.length;
        break;
        
      case 'min':
        result[outputField] = Math.min(...data.map(row => Number(row[field]) || 0));
        break;
        
      case 'max':
        result[outputField] = Math.max(...data.map(row => Number(row[field]) || 0));
        break;
        
      case 'count':
        result[outputField] = data.length;
        break;
    }
  }
  
  return [result];
}

function applyJoinOperation(leftData: any[], rightData: any[], config: any): any[] {
  const { leftField, rightField, type = 'inner' } = config;
  
  // Create a map of right data by join field for faster lookup
  const rightMap = new Map();
  for (const rightRow of rightData) {
    const key = String(rightRow[rightField]);
    if (!rightMap.has(key)) {
      rightMap.set(key, []);
    }
    rightMap.get(key).push(right
