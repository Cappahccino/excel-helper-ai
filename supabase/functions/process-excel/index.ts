import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.37.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Create a Supabase client with the admin key
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      operation,
      data,
      configuration,
      previousNodeOutput,
      nodeId,
      workflowId,
      executionId,
      previewMode = false, // Add this new parameter
      maxRows = 10 // Add this for preview mode
    } = await req.json();

    console.log(`Processing request for node ${nodeId} in workflow ${workflowId}`);
    console.log(`Preview mode: ${previewMode ? 'enabled' : 'disabled'}`);
    
    // Validate required parameters
    if (!nodeId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: nodeId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!workflowId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: workflowId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // For preview mode, add this:
    if (previewMode) {
      console.log(`Preview mode: processing sample data with ${data?.length || 0} rows`);
      
      // Skip database operations and just return processed data
      // Apply the processing based on the configuration
      let processedData = [];
      let resultColumns = [];
      
      // Sample implementation for filtering operation in preview mode
      if (configuration.operation === 'filter' || (configuration.column && configuration.operator)) {
        const column = configuration.column;
        const operator = configuration.operator;
        const value = configuration.value;
        
        console.log(`Filtering on column: ${column}, operator: ${operator}, value: ${value}`);
        
        if (!data || !Array.isArray(data)) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid data format for filtering operation' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Apply the filter
        switch (operator) {
          case 'equals':
            processedData = data.filter(row => row[column] == value);
            break;
          case 'not-equals':
            processedData = data.filter(row => row[column] != value);
            break;
          case 'greater-than':
            processedData = data.filter(row => {
              const numVal = parseFloat(row[column]);
              return !isNaN(numVal) && numVal > parseFloat(value);
            });
            break;
          case 'less-than':
            processedData = data.filter(row => {
              const numVal = parseFloat(row[column]);
              return !isNaN(numVal) && numVal < parseFloat(value);
            });
            break;
          case 'contains':
            processedData = data.filter(row => {
              const rowVal = String(row[column] || '');
              return rowVal.includes(value);
            });
            break;
          case 'starts-with':
            processedData = data.filter(row => {
              const rowVal = String(row[column] || '');
              return rowVal.startsWith(value);
            });
            break;
          case 'ends-with':
            processedData = data.filter(row => {
              const rowVal = String(row[column] || '');
              return rowVal.endsWith(value);
            });
            break;
          default:
            // Default to passing through all data
            processedData = data;
        }
        
        // Limit rows for preview
        processedData = processedData.slice(0, maxRows);
        
        // Get columns from the first row
        if (processedData.length > 0) {
          resultColumns = Object.keys(processedData[0]);
        } else if (data.length > 0) {
          resultColumns = Object.keys(data[0]);
        }
      }
      // Add similar preview handlers for other operations (sort, aggregate, etc.)
      else if (configuration.operation === 'sort' || (configuration.column && configuration.order)) {
        const column = configuration.column;
        const order = configuration.order || 'ascending';
        
        console.log(`Sorting on column: ${column}, order: ${order}`);
        
        if (!data || !Array.isArray(data)) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid data format for sorting operation' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Create a copy of the data to avoid modifying the original
        processedData = [...data];
        
        // Apply the sort
        processedData.sort((a, b) => {
          let valA = a[column];
          let valB = b[column];
          
          // Handle numeric values
          if (!isNaN(Number(valA)) && !isNaN(Number(valB))) {
            valA = Number(valA);
            valB = Number(valB);
          }
          
          // Handle string values
          if (typeof valA === 'string' && typeof valB === 'string') {
            return order === 'ascending' 
              ? valA.localeCompare(valB) 
              : valB.localeCompare(valA);
          }
          
          // Handle other types
          if (order === 'ascending') {
            return valA < valB ? -1 : valA > valB ? 1 : 0;
          } else {
            return valA > valB ? -1 : valA < valB ? 1 : 0;
          }
        });
        
        // Limit rows for preview
        processedData = processedData.slice(0, maxRows);
        
        // Get columns from the first row
        if (processedData.length > 0) {
          resultColumns = Object.keys(processedData[0]);
        }
      }
      else if (configuration.operation === 'aggregate' || configuration.function) {
        const aggFunction = configuration.function || 'sum';
        const column = configuration.column;
        const groupByColumn = configuration.groupBy;
        
        console.log(`Aggregating column: ${column}, function: ${aggFunction}, groupBy: ${groupByColumn}`);
        
        if (!data || !Array.isArray(data)) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid data format for aggregation operation' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Helper functions for statistical calculations
        const calculateMedian = (numbers: number[]) => {
          const sorted = numbers.sort((a, b) => a - b);
          const middle = Math.floor(sorted.length / 2);
          if (sorted.length % 2 === 0) {
            return (sorted[middle - 1] + sorted[middle]) / 2;
          }
          return sorted[middle];
        };
        
        const calculateMode = (numbers: number[]) => {
          const counts = new Map();
          let maxCount = 0;
          let mode = null;
          
          for (const num of numbers) {
            const count = (counts.get(num) || 0) + 1;
            counts.set(num, count);
            if (count > maxCount) {
              maxCount = count;
              mode = num;
            }
          }
          
          return mode;
        };
        
        const calculateStdDev = (numbers: number[]) => {
          const mean = numbers.reduce((sum, val) => sum + val, 0) / numbers.length;
          const squareDiffs = numbers.map(value => Math.pow(value - mean, 2));
          const variance = squareDiffs.reduce((sum, val) => sum + val, 0) / numbers.length;
          return Math.sqrt(variance);
        };
        
        const calculateVariance = (numbers: number[]) => {
          const mean = numbers.reduce((sum, val) => sum + val, 0) / numbers.length;
          const squareDiffs = numbers.map(value => Math.pow(value - mean, 2));
          return squareDiffs.reduce((sum, val) => sum + val, 0) / numbers.length;
        };
        
        // If no groupBy, perform a simple aggregation
        if (!groupByColumn) {
          let result;
          const numbers = data.map(row => Number(row[column]) || 0);
          
          switch (aggFunction) {
            case 'sum':
              result = numbers.reduce((sum, val) => sum + val, 0);
              break;
            case 'avg':
              result = numbers.reduce((sum, val) => sum + val, 0) / (numbers.length || 1);
              break;
            case 'min':
              result = Math.min(...numbers);
              break;
            case 'max':
              result = Math.max(...numbers);
              break;
            case 'count':
              result = numbers.length;
              break;
            case 'median':
              result = calculateMedian(numbers);
              break;
            case 'mode':
              result = calculateMode(numbers);
              break;
            case 'stddev':
              result = calculateStdDev(numbers);
              break;
            case 'variance':
              result = calculateVariance(numbers);
              break;
            case 'first':
              result = numbers[0];
              break;
            case 'last':
              result = numbers[numbers.length - 1];
              break;
            default:
              result = 0;
          }
          
          processedData = [{ 
            [aggFunction]: result,
            column: column
          }];
        } 
        // If groupBy is specified, perform grouped aggregation
        else {
          const groups = {};
          
          // Group the data
          data.forEach(row => {
            const groupValue = row[groupByColumn];
            if (!groups[groupValue]) {
              groups[groupValue] = [];
            }
            groups[groupValue].push(row);
          });
          
          // Apply aggregation to each group
          processedData = Object.entries(groups).map(([groupValue, groupRows]) => {
            let result;
            const numbers = groupRows.map(row => Number(row[column]) || 0);
            
            switch (aggFunction) {
              case 'sum':
                result = numbers.reduce((sum, val) => sum + val, 0);
                break;
              case 'avg':
                result = numbers.reduce((sum, val) => sum + val, 0) / (numbers.length || 1);
                break;
              case 'min':
                result = Math.min(...numbers);
                break;
              case 'max':
                result = Math.max(...numbers);
                break;
              case 'count':
                result = numbers.length;
                break;
              case 'median':
                result = calculateMedian(numbers);
                break;
              case 'mode':
                result = calculateMode(numbers);
                break;
              case 'stddev':
                result = calculateStdDev(numbers);
                break;
              case 'variance':
                result = calculateVariance(numbers);
                break;
              case 'first':
                result = numbers[0];
                break;
              case 'last':
                result = numbers[numbers.length - 1];
                break;
              default:
                result = 0;
            }
            
            return {
              [groupByColumn]: groupValue,
              [aggFunction]: result,
              column: column
            };
          });
        }
        
        // Limit rows for preview
        processedData = processedData.slice(0, maxRows);
        
        // Get columns from the first row
        if (processedData.length > 0) {
          resultColumns = Object.keys(processedData[0]);
        }
      }
      else if (configuration.operation === 'textTransformation' || configuration.transformation) {
        const column = configuration.column;
        const transformation = configuration.transformation || 'uppercase';
        const findText = configuration.find || '';
        const replaceText = configuration.replace || '';
        
        console.log(`Text transformation on column: ${column}, type: ${transformation}`);
        
        if (!data || !Array.isArray(data)) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid data format for text transformation operation' 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Create a copy of the data
        processedData = data.map(row => {
          const newRow = { ...row };
          
          if (newRow[column] && typeof newRow[column] === 'string') {
            switch (transformation) {
              case 'uppercase':
                newRow[column] = newRow[column].toUpperCase();
                break;
              case 'lowercase':
                newRow[column] = newRow[column].toLowerCase();
                break;
              case 'trim':
                newRow[column] = newRow[column].trim();
                break;
              case 'replace':
                newRow[column] = newRow[column].replace(new RegExp(findText, 'g'), replaceText);
                break;
              default:
                // No transformation
            }
          }
          
          return newRow;
        });
        
        // Limit rows for preview
        processedData = processedData.slice(0, maxRows);
        
        // Get columns from the first row
        if (processedData.length > 0) {
          resultColumns = Object.keys(processedData[0]);
        }
      }
      else {
        // Default to passing through the data
        processedData = data ? data.slice(0, maxRows) : [];
        
        if (processedData.length > 0) {
          resultColumns = Object.keys(processedData[0]);
        }
      }
      
      return new Response(
        JSON.stringify({
          result: {
            processedData,
            columns: resultColumns,
            rowCount: processedData.length,
            preview: true
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Non-preview mode processing
    // Log the operation details
    console.log(`Processing operation: ${operation || 'default'}`);
    console.log(`Configuration:`, JSON.stringify(configuration));

    // Create a log entry for this processing step
    const logEntry = {
      workflow_id: workflowId,
      execution_id: executionId || null,
      node_id: nodeId,
      operation_type: operation || 'process',
      input_data: data ? { summary: `${Array.isArray(data) ? data.length : 0} records` } : null,
      configuration: configuration || {},
      status: 'processing',
      created_at: new Date().toISOString()
    };

    // Insert the log entry
    const { data: logData, error: logError } = await supabase
      .from('workflow_step_logs')
      .insert(logEntry)
      .select()
      .single();

    if (logError) {
      console.error('Error creating log entry:', logError);
    }

    const logId = logData?.id;
    console.log(`Created log entry with ID: ${logId}`);

    // Process the data based on the operation type
    let result;
    let processedData = [];
    let error = null;

    try {
      // Simple processing logic based on operation type
      if (operation === 'filter' || (configuration?.column && configuration?.operator)) {
        const column = configuration.column;
        const operator = configuration.operator || 'equals';
        const value = configuration.value;
        
        console.log(`Filtering data on column ${column} with operator ${operator} and value ${value}`);
        
        if (!data || !Array.isArray(data)) {
          throw new Error('Invalid data format for filtering operation');
        }
        
        // Apply the filter
        switch (operator) {
          case 'equals':
            processedData = data.filter(row => row[column] == value);
            break;
          case 'not-equals':
            processedData = data.filter(row => row[column] != value);
            break;
          case 'greater-than':
            processedData = data.filter(row => {
              const numVal = parseFloat(row[column]);
              return !isNaN(numVal) && numVal > parseFloat(value);
            });
            break;
          case 'less-than':
            processedData = data.filter(row => {
              const numVal = parseFloat(row[column]);
              return !isNaN(numVal) && numVal < parseFloat(value);
            });
            break;
          case 'contains':
            processedData = data.filter(row => {
              const rowVal = String(row[column] || '');
              return rowVal.includes(value);
            });
            break;
          case 'starts-with':
            processedData = data.filter(row => {
              const rowVal = String(row[column] || '');
              return rowVal.startsWith(value);
            });
            break;
          case 'ends-with':
            processedData = data.filter(row => {
              const rowVal = String(row[column] || '');
              return rowVal.endsWith(value);
            });
            break;
          default:
            processedData = data;
        }
        
        result = {
          processedData,
          rowCount: processedData.length,
          operation: 'filter',
          filterCriteria: { column, operator, value }
        };
      } 
      else if (operation === 'sort' || (configuration?.column && configuration?.order)) {
        const column = configuration.column;
        const order = configuration.order || 'ascending';
        
        console.log(`Sorting data on column ${column} in ${order} order`);
        
        if (!data || !Array.isArray(data)) {
          throw new Error('Invalid data format for sorting operation');
        }
        
        // Create a copy of the data
        processedData = [...data];
        
        // Apply the sort
        processedData.sort((a, b) => {
          let valA = a[column];
          let valB = b[column];
          
          // Handle numeric values
          if (!isNaN(Number(valA)) && !isNaN(Number(valB))) {
            valA = Number(valA);
            valB = Number(valB);
          }
          
          // Handle string values
          if (typeof valA === 'string' && typeof valB === 'string') {
            return order === 'ascending' 
              ? valA.localeCompare(valB) 
              : valB.localeCompare(valA);
          }
          
          // Handle other types
          if (order === 'ascending') {
            return valA < valB ? -1 : valA > valB ? 1 : 0;
          } else {
            return valA > valB ? -1 : valA < valB ? 1 : 0;
          }
        });
        
        result = {
          processedData,
          rowCount: processedData.length,
          operation: 'sort',
          sortCriteria: { column, order }
        };
      }
      else {
        // Default processing - pass through the data
        console.log('No specific operation defined, passing data through');
        processedData = data || [];
        result = {
          processedData,
          rowCount: Array.isArray(processedData) ? processedData.length : 0,
          operation: 'passthrough'
        };
      }
      
      // Update the log entry with the result
      if (logId) {
        const { error: updateError } = await supabase
          .from('workflow_step_logs')
          .update({
            status: 'completed',
            output_data: {
              result: {
                summary: `Processed ${result.rowCount} records`,
                operation: result.operation
              }
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', logId);
          
        if (updateError) {
          console.error('Error updating log entry:', updateError);
        }
      }
      
      // Return the processed data
      return new Response(
        JSON.stringify({ result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (processingError) {
      console.error('Error processing data:', processingError);
      
      // Update the log entry with the error
      if (logId) {
        const { error: updateError } = await supabase
          .from('workflow_step_logs')
          .update({
            status: 'failed',
            error_message: processingError.message,
            completed_at: new Date().toISOString()
          })
          .eq('id', logId);
          
        if (updateError) {
          console.error('Error updating log entry with error:', updateError);
        }
      }
      
      return new Response(
        JSON.stringify({ 
          error: `Processing error: ${processingError.message}`,
          details: processingError.stack
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    
    return new Response(
      JSON.stringify({ 
        error: `Server error: ${error.message}`,
        details: error.stack
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
})
