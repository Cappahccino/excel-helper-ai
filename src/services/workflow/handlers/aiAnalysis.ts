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
  
  // Build a prompt for
