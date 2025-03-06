
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.36.0";
import { z } from "https://esm.sh/zod@3.22.4";

// Set up CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Define supported operations
const operations = [
  "filtering",
  "sorting",
  "aggregation",
  "formulaCalculation",
  "textTransformation",
  "dataTypeConversion",
  "dateFormatting",
  "pivotTable",
  "joinMerge",
  "deduplication",
] as const;

// Validation schema for the request body
const requestSchema = z.object({
  operation: z.enum(operations),
  data: z.any(),
  configuration: z.record(z.any()).optional(),
  previousNodeOutput: z.any().optional(),
  nodeId: z.string(),
  workflowId: z.string(),
  executionId: z.string(),
});

// Initialize Supabase client
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// Helper to generate OpenAI prompts based on operation type
function generatePrompt(operation: typeof operations[number], data: any, config: Record<string, any>) {
  const basePrompt = `You are an expert data analyst. I have a dataset and I need to perform the following operation: ${operation}`;
  
  let specificPrompt = "";
  switch (operation) {
    case "filtering":
      specificPrompt = `Filter the data where ${config.column} ${config.operator} ${config.value}.`;
      break;
    case "sorting":
      specificPrompt = `Sort the data by ${config.column} in ${config.order} order.`;
      break;
    case "aggregation":
      specificPrompt = `Perform ${config.function} on column ${config.column}${config.groupBy ? ` grouped by ${config.groupBy}` : ""}.`;
      break;
    case "formulaCalculation":
      specificPrompt = `Create a formula that ${config.description}. The formula should be applicable to Excel.`;
      break;
    case "textTransformation":
      specificPrompt = `Transform the text in column ${config.column} by ${config.transformation}${config.transformation === 'replace' ? ` replacing "${config.find}" with "${config.replace}"` : ''}.`;
      break;
    case "dataTypeConversion":
      specificPrompt = `Convert column ${config.column} from ${config.fromType || 'its current type'} to ${config.toType}.`;
      break;
    case "dateFormatting":
      specificPrompt = `Format dates in column ${config.column} to ${config.format}.`;
      break;
    case "pivotTable":
      specificPrompt = `Create a pivot table with rows ${config.rows?.join(", ") || 'undefined'}, columns ${config.columns?.join(", ") || 'undefined'}, and values ${config.values?.join(", ") || 'undefined'}.`;
      break;
    case "joinMerge":
      specificPrompt = `Merge these two datasets using a ${config.joinType} join on columns ${config.leftKey} from the first dataset and ${config.rightKey} from the second dataset.`;
      break;
    case "deduplication":
      specificPrompt = `Remove duplicate entries based on columns ${config.columns?.join(", ") || 'all columns'}. ${config.caseSensitive ? "Consider case when comparing" : "Ignore case when comparing"}.`;
      break;
    default:
      specificPrompt = `Analyze this data and ${config.customInstructions || "provide insights"}.`;
  }
  
  return `${basePrompt}\n\n${specificPrompt}\n\nHere is the data:\n${JSON.stringify(data, null, 2)}\n\nProvide the processed data in JSON format and include an explanation of what you did.`;
}

// Process the data programmatically when possible, fallback to AI for complex cases
async function processData(operation: typeof operations[number], data: any, config: Record<string, any>) {
  // Simple implementation for basic operations
  try {
    switch (operation) {
      case "filtering":
        if (!config.column || !config.operator) {
          throw new Error("Missing required configuration for filtering");
        }
        
        const filteredData = data.filter((item: any) => {
          const value = item[config.column];
          switch(config.operator) {
            case "equals":
              return String(value) === String(config.value);
            case "contains":
              return String(value).includes(String(config.value));
            case "startsWith":
              return String(value).startsWith(String(config.value));
            case "endsWith":
              return String(value).endsWith(String(config.value));
            case "greaterThan":
              return Number(value) > Number(config.value);
            case "lessThan":
              return Number(value) < Number(config.value);
            default:
              return false;
          }
        });
        
        return {
          success: true,
          data: filteredData,
          explanation: `Filtered data where ${config.column} ${config.operator} ${config.value}. Found ${filteredData.length} matching rows.`
        };
        
      case "sorting":
        if (!config.column) {
          throw new Error("Missing required configuration for sorting");
        }
        
        const sortedData = [...data].sort((a: any, b: any) => {
          const valueA = a[config.column];
          const valueB = b[config.column];
          
          // Handle different data types
          if (typeof valueA === 'string' && typeof valueB === 'string') {
            return config.order === 'ascending' 
              ? valueA.localeCompare(valueB) 
              : valueB.localeCompare(valueA);
          } else {
            return config.order === 'ascending' 
              ? (valueA - valueB) 
              : (valueB - valueA);
          }
        });
        
        return {
          success: true,
          data: sortedData,
          explanation: `Sorted data by ${config.column} in ${config.order} order.`
        };
        
      case "textTransformation":
        if (!config.column || !config.transformation) {
          throw new Error("Missing required configuration for text transformation");
        }
        
        const transformedData = data.map((item: any) => {
          const value = String(item[config.column]);
          let transformed;
          
          switch (config.transformation) {
            case "uppercase":
              transformed = value.toUpperCase();
              break;
            case "lowercase":
              transformed = value.toLowerCase();
              break;
            case "trim":
              transformed = value.trim();
              break;
            case "replace":
              if (config.find) {
                transformed = value.split(config.find).join(config.replace || '');
              } else {
                transformed = value;
              }
              break;
            default:
              transformed = value;
          }
          
          return { ...item, [config.column]: transformed };
        });
        
        return {
          success: true,
          data: transformedData,
          explanation: `Applied ${config.transformation} transformation to column ${config.column}.`
        };
        
      case "deduplication":
        if (!config.columns || !config.columns.length) {
          // Deduplicate based on all fields
          const seen = new Set();
          const deduplicatedData = data.filter((item: any) => {
            const key = JSON.stringify(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          
          return {
            success: true,
            data: deduplicatedData,
            explanation: `Removed duplicates based on all columns. Reduced from ${data.length} to ${deduplicatedData.length} rows.`
          };
        } else {
          // Deduplicate based on specific columns
          const seen = new Set();
          const deduplicatedData = data.filter((item: any) => {
            const keyParts = config.columns.map((col: string) => {
              let value = item[col];
              if (typeof value === 'string' && !config.caseSensitive) {
                value = value.toLowerCase();
              }
              return value;
            });
            
            const key = JSON.stringify(keyParts);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          
          return {
            success: true,
            data: deduplicatedData,
            explanation: `Removed duplicates based on columns: ${config.columns.join(', ')}. Reduced from ${data.length} to ${deduplicatedData.length} rows.`
          };
        }
        
      // For more complex operations, fallback to AI processing
      default:
        return null; // Fallback to AI processing
    }
  } catch (error) {
    console.error(`Error in programmatic processing: ${error.message}`);
    return null; // Fallback to AI processing
  }
}

// Process the data using OpenAI
async function processWithAI(prompt: string) {
  const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIApiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert data analyst assistant specialized in Excel and data processing operations." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.choices[0].message.content;
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    throw new Error(`Failed to process with AI: ${error.message}`);
  }
}

// Parse AI response to extract processed data
function parseAIResponse(aiResponse: string) {
  try {
    // Look for JSON blocks in the response
    const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || 
                     aiResponse.match(/```\n([\s\S]*?)\n```/) ||
                     aiResponse.match(/{[\s\S]*?}/);
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[0].replace(/```json\n|```\n|```/g, '');
      return {
        processedData: JSON.parse(jsonStr),
        explanation: aiResponse.replace(jsonMatch[0], '').trim()
      };
    }
    
    // If no JSON block found, try to parse the whole response as JSON
    try {
      return {
        processedData: JSON.parse(aiResponse),
        explanation: "Data processed successfully."
      };
    } catch {
      // If we can't parse JSON, return the raw response
      return {
        processedData: null,
        explanation: aiResponse,
        error: "Could not extract structured data from AI response"
      };
    }
  } catch (error) {
    console.error("Error parsing AI response:", error);
    return {
      processedData: null,
      explanation: aiResponse,
      error: `Failed to parse AI response: ${error.message}`
    };
  }
}

// Update workflow execution status
async function updateWorkflowNodeState(executionId: string, nodeId: string, status: string, output: any) {
  try {
    const { data, error } = await supabaseAdmin
      .from('workflow_executions')
      .select('node_states')
      .eq('id', executionId)
      .single();
    
    if (error) throw error;
    
    let nodeStates = data.node_states || {};
    nodeStates[nodeId] = {
      ...nodeStates[nodeId],
      status,
      output,
      updated_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabaseAdmin
      .from('workflow_executions')
      .update({ node_states: nodeStates })
      .eq('id', executionId);
    
    if (updateError) throw updateError;
  } catch (error) {
    console.error("Error updating workflow node state:", error);
  }
}

// Main handler function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const reqBody = await req.json();
    console.log("Request received:", JSON.stringify(reqBody, null, 2));
    
    // Validate request body
    const validationResult = requestSchema.safeParse(reqBody);
    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid request format", 
          details: validationResult.error.format() 
        }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    const { operation, data, configuration, nodeId, workflowId, executionId } = validationResult.data;
    
    // Update node status to processing
    await updateWorkflowNodeState(executionId, nodeId, "processing", null);
    
    // Try to process data programmatically first
    const programmaticResult = await processData(operation, data, configuration || {});
    
    if (programmaticResult) {
      // Update node status with programmatic results
      await updateWorkflowNodeState(
        executionId, 
        nodeId, 
        programmaticResult.error ? "error" : "completed", 
        {
          data: programmaticResult.data,
          explanation: programmaticResult.explanation,
          error: programmaticResult.error
        }
      );
      
      return new Response(
        JSON.stringify({
          success: true,
          operation,
          result: programmaticResult
        }),
        { headers: corsHeaders }
      );
    }
    
    // If programmatic processing failed or not implemented, fallback to AI
    // Generate prompt and process with AI
    const prompt = generatePrompt(operation, data, configuration || {});
    console.log("Generated prompt:", prompt);
    
    const aiResponse = await processWithAI(prompt);
    console.log("AI response:", aiResponse);
    
    const parsedResponse = parseAIResponse(aiResponse);
    
    // Update node status with results
    await updateWorkflowNodeState(
      executionId, 
      nodeId, 
      parsedResponse.error ? "error" : "completed", 
      {
        data: parsedResponse.processedData,
        explanation: parsedResponse.explanation,
        error: parsedResponse.error
      }
    );
    
    return new Response(
      JSON.stringify({
        success: true,
        operation,
        result: parsedResponse
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error in process-excel function:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "An unexpected error occurred",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
