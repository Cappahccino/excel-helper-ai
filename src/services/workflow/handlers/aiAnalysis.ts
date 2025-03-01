// src/services/workflow/handlers/aiAnalysis.ts

import { NodeDefinition } from '@/types/workflow';
import { supabase } from "@/integrations/supabase/client";
import { triggerAIResponse } from "@/services/aiService";


interface AIAnalysisConfig {
  operation: 'analyze' | 'summarize' | 'extract' | 'classify' | 'generate_formula' | 'custom';
  prompt?: string;
  targetFields?: string[];
  analysisOptions?: {
    detectOutliers?: boolean;
    findPatterns?: boolean;
    identifyTrends?: boolean;
    suggestImprovements?: boolean;
    confidenceThreshold?: number;
  };
  extractionOptions?: {
    format?: 'json' | 'csv' | 'text';
    structure?: Record<string, string>;
  };
  classificationOptions?: {
    categories: string[];
    multiLabel?: boolean;
  };
  customOptions?: Record<string, any>;
}

export async function handleAIAnalysis(
  node: NodeDefinition,
  inputs: Record<string, any>,
  context: any
) {
  const config = node.data.config as AIAnalysisConfig;
  
  // Validate that we have data to analyze
  if (!inputs.data) {
    throw new Error('No data provided for AI analysis');
  }
  
  await context.logMessage(`Starting AI ${config.operation}`, 'info', node.id);
  
  try {
    let result;
    
    switch (config.operation) {
      case 'analyze':
        result = await performDataAnalysis(inputs.data, config, context);
        break;
        
      case 'summarize':
        result = await performDataSummarization(inputs.data, config, context);
        break;
        
      case 'extract':
        result = await performDataExtraction(inputs.data, config, context);
        break;
        
      case 'classify':
        result = await performDataClassification(inputs.data, config, context);
        break;
        
      case 'generate_formula':
        result = await generateFormula(inputs.data, config, context);
        break;
        
      case 'custom':
        result = await performCustomAIOperation(inputs.data, config, context);
        break;
        
      default:
        throw new Error(`Unknown AI operation: ${config.operation}`);
    }
    
    await context.logMessage(`Completed AI ${config.operation}`, 'info', node.id);
    
    return {
      result,
      operation: config.operation,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    await context.logMessage(
      `AI operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error',
      node.id
    );
    throw error;
  }
}

async function performDataAnalysis(data: any[], config: AIAnalysisConfig, context: any) {
  const { analysisOptions = {} } = config;
  
  // Prepare the data for analysis
  const dataPreview = JSON.stringify(data.slice(0, 10));
  const dataSchema = inferSchema(data);
  
  // Build a prompt for the AI
  const prompt = config.prompt || buildAnalysisPrompt(data, analysisOptions);
  
  await context.logMessage(`Sending data for analysis (${data.length} rows)`, 'info', context.nodeId);
  
  // Use your existing AI service
  const response = await callAIService({
    query: prompt,
    data: {
      type: 'analysis',
      data: data,
      dataPreview,
      dataSchema,
      options: analysisOptions
    },
    userId: context.userId
  });
  
  // Process the AI response
  return {
    insights: response.insights || [],
    statistics: response.statistics || {},
    recommendations: response.recommendations || [],
    visualizations: response.visualizations || [],
    rawResponse: response.content
  };
}

async function performDataSummarization(data: any[], config: AIAnalysisConfig, context: any) {
  // Build a prompt for the AI
  const prompt = config.prompt || `Summarize the following data:\n${JSON.stringify(data.slice(0, 50))}`;
  
  await context.logMessage(`Sending data for summarization (${data.length} rows)`, 'info', context.nodeId);
  
  // Use your existing AI service
  const response = await callAIService({
    query: prompt,
    data: {
      type: 'summarization',
      data: data
    },
    userId: context.userId
  });
  
  return {
    summary: response.content,
    keyPoints: response.keyPoints || [],
    metadata: response.metadata || {}
  };
}

async function performDataExtraction(data: any, config: AIAnalysisConfig, context: any) {
  const { extractionOptions = {} } = config;
  
  // Handle both array data and text/unstructured data
  const inputData = Array.isArray(data) ? JSON.stringify(data) : data;
  
  // Build a prompt for the AI
  const prompt = config.prompt || `Extract the following information from the data: ${config.targetFields?.join(', ') || 'all relevant fields'}`;
  
  await context.logMessage(`Sending data for extraction`, 'info', context.nodeId);
  
  // Use your existing AI service
  const response = await callAIService({
    query: prompt,
    data: {
      type: 'extraction',
      data: inputData,
      format: extractionOptions.format || 'json',
      structure: extractionOptions.structure
    },
    userId: context.userId
  });
  
  return {
    extractedData: response.extractedData || response.content,
    format: extractionOptions.format || 'json',
    confidence: response.confidence,
    metadata: response.metadata || {}
  };
}

async function performDataClassification(data: any[], config: AIAnalysisConfig, context: any) {
  const { classificationOptions = {} } = config;
  
  if (!classificationOptions.categories || classificationOptions.categories.length === 0) {
    throw new Error('Classification categories are required');
  }
  
  // Build a prompt for the AI
  const categoriesStr = classificationOptions.categories.join(', ');
  const prompt = config.prompt || 
    `Classify the following data into these categories: ${categoriesStr}. ${
      classificationOptions.multiLabel ? 'Items can belong to multiple categories.' : 'Each item should be assigned to exactly one category.'
    }`;
  
  await context.logMessage(`Sending data for classification (${data.length} rows)`, 'info', context.nodeId);
  
  // Use your existing AI service
  const response = await callAIService({
    query: prompt,
    data: {
      type: 'classification',
      data: data,
      categories: classificationOptions.categories,
      multiLabel: classificationOptions.multiLabel || false
    },
    userId: context.userId
  });
  
  // Process and format classification results
  const classifications = Array.isArray(response.classifications) 
    ? response.classifications 
    : formatClassificationResults(data, response.content, classificationOptions.categories);
  
  return {
    classifications,
    categoryDistribution: calculateCategoryDistribution(classifications, classificationOptions.categories),
    confidence: response.confidence,
    rawResponse: response.content
  };
}

async function generateFormula(data: any[], config: AIAnalysisConfig, context: any) {
  // Build a prompt for the AI
  const prompt = config.prompt || 'Generate an Excel formula to process the following data and achieve the desired result.';
  
  await context.logMessage('Generating formula based on data patterns', 'info', context.nodeId);
  
  // Use your existing AI service
  const response = await callAIService({
    query: prompt,
    data: {
      type: 'formula_generation',
      data: data.slice(0, 50), // Limited sample for formula generation
      targetFields: config.targetFields || []
    },
    userId: context.userId
  });
  
  return {
    formula: response.formula || response.content,
    explanation: response.explanation || '',
    examples: response.examples || [],
    alternativeFormulas: response.alternativeFormulas || []
  };
}

async function performCustomAIOperation(data: any, config: AIAnalysisConfig, context: any) {
  const { customOptions = {} } = config;
  
  if (!config.prompt) {
    throw new Error('A prompt is required for custom AI operations');
  }
  
  await context.logMessage(`Performing custom AI operation`, 'info', context.nodeId);
  
  // Use your existing AI service
  const response = await callAIService({
    query: config.prompt,
    data: {
      type: 'custom',
      data: data,
      options: customOptions
    },
    userId: context.userId
  });
  
  // Return the raw response for custom handling
  return {
    result: response.content,
    metadata: response.metadata || {},
    format: customOptions.format || 'text'
  };
}

// Helper function to call the AI service
async function callAIService(params: {
  query: string;
  data: any;
  userId: string;
}) {
  try {
    // Call your Supabase Edge Function
    const { data: responseData, error } = await supabase.functions.invoke('ai-service', {
      body: {
        operation: params.data.type,
        query: params.query,
        data: params.data.data,
        options: params.data.options || {},
        userId: params.userId
      }
    });

    if (error) throw error;
    
    return responseData;
  } catch (error) {
    console.error('AI service error:', error);
    throw new Error(`AI service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


// Helper functions for data processing

function inferSchema(data: any[]) {
  if (!data || data.length === 0) return {};
  
  const sample = data[0];
  const schema: Record<string, string> = {};
  
  for (const key of Object.keys(sample)) {
    const value = sample[key];
    let type = typeof value;
    
    if (type === 'object') {
      if (value === null) {
        type = 'null';
      } else if (Array.isArray(value)) {
        type = 'array';
      } else if (value instanceof Date) {
        type = 'date';
      }
    }
    
    schema[key] = type;
  }
  
  return schema;
}
