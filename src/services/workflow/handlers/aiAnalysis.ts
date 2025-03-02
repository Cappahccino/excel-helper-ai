
// src/services/workflow/handlers/aiAnalysis.ts

import { NodeData, NodeInputs, NodeOutputs, NodeHandler } from '@/types/workflow';
import { supabase } from '@/integrations/supabase/client';

// Helper function to build analysis prompt based on data and options
function buildAnalysisPrompt(data: any[], options: any = {}): string {
  const sampleSize = Math.min(5, data.length);
  const samples = data.slice(0, sampleSize);
  
  let prompt = `Analyze the following data:\n\n`;
  
  // Include sample data
  if (samples.length > 0 && Array.isArray(samples)) {
    // Get headers if the data is an array of objects
    const headers = Object.keys(samples[0] || {});
    
    // Add headers
    prompt += headers.join('\t') + '\n';
    
    // Add sample rows
    for (const row of samples) {
      prompt += headers.map(h => row[h]).join('\t') + '\n';
    }
  }
  
  prompt += `\nThis is a sample of ${data.length} total records.\n\n`;
  
  // Add specific analysis instructions based on options
  if (options.detectOutliers) {
    prompt += `Please identify any outliers or anomalies in the data.\n`;
  }
  
  if (options.findPatterns) {
    prompt += `Please identify any patterns, trends, or correlations in the data.\n`;
  }
  
  prompt += `\nProvide a comprehensive analysis including summary statistics, insights, and recommendations.`;
  
  return prompt;
}

// Helper function to format classification results
function formatClassificationResults(results: any[], categories: string[] = [], multiLabel: boolean = false): any[] {
  return results.map(item => {
    const classifications = Array.isArray(item.classifications) 
      ? item.classifications 
      : [];
    
    if (multiLabel) {
      // For multi-label, return all matching categories
      return {
        ...item,
        classifications: classifications
          .filter(c => c.confidence > 0.5)
          .map(c => c.category)
      };
    } else {
      // For single-label, return only the top category
      const topClassification = classifications.length > 0
        ? classifications.reduce((prev, current) => 
            (current.confidence > prev.confidence) ? current : prev
          )
        : { category: null, confidence: 0 };
      
      return {
        ...item,
        category: topClassification.category,
        confidence: topClassification.confidence
      };
    }
  });
}

// Helper function to calculate category distribution
function calculateCategoryDistribution(results: any[], categories: string[] = []): Record<string, number> {
  const distribution: Record<string, number> = {};
  
  // Initialize categories with zero counts
  for (const category of categories) {
    distribution[category] = 0;
  }
  
  // Count occurrences of each category
  for (const result of results) {
    if (Array.isArray(result.classifications)) {
      // Multi-label case
      for (const classification of result.classifications) {
        const category = classification.category;
        distribution[category] = (distribution[category] || 0) + 1;
      }
    } else if (result.category) {
      // Single-label case
      const category = result.category;
      distribution[category] = (distribution[category] || 0) + 1;
    }
  }
  
  return distribution;
}

export const aiAnalysis: NodeHandler = {
  type: 'aiAnalyze',
  
  async execute(nodeData: NodeData, inputs: NodeInputs): Promise<NodeOutputs> {
    console.log('Executing AI Analysis node', nodeData);
    
    const inputData = inputs.input;
    if (!inputData || !Array.isArray(inputData)) {
      throw new Error('AI Analysis node requires array input data');
    }
    
    const config = nodeData.config || {};
    const analysisOptions = config.analysisOptions || {};
    
    try {
      switch (nodeData.subtype || 'analyze') {
        case 'analyze': {
          // Generate prompt based on data and options
          const prompt = buildAnalysisPrompt(inputData, analysisOptions);
          
          // Call AI service for analysis
          const { data: aiResponse, error } = await supabase.functions.invoke('ai-service', {
            body: {
              prompt,
              type: 'analysis',
              options: analysisOptions
            }
          });
          
          if (error) throw error;
          
          return {
            output: {
              originalData: inputData,
              analysis: aiResponse.analysis,
              summary: aiResponse.summary,
              insights: aiResponse.insights || [],
              statistics: aiResponse.statistics || {}
            }
          };
        }
        
        case 'classify': {
          const classificationOptions = config.classificationOptions || {};
          const categories = classificationOptions.categories || [];
          
          if (!categories || categories.length === 0) {
            throw new Error('Classification requires categories to be defined');
          }
          
          const multiLabel = classificationOptions.multiLabel || false;
          
          // Call AI service for classification
          const { data: aiResponse, error } = await supabase.functions.invoke('ai-service', {
            body: {
              data: inputData,
              type: 'classification',
              options: {
                categories: categories,
                multiLabel: multiLabel
              }
            }
          });
          
          if (error) throw error;
          
          // Format classification results
          const classifiedData = formatClassificationResults(aiResponse.results, categories);
          
          // Calculate distribution of categories
          const distribution = calculateCategoryDistribution(aiResponse.results, categories);
          
          return {
            output: {
              classifiedData,
              distribution,
              originalData: inputData
            }
          };
        }
        
        case 'summarize': {
          const summaryOptions = config.summaryOptions || {};
          
          // Call AI service for summarization
          const { data: aiResponse, error } = await supabase.functions.invoke('ai-service', {
            body: {
              data: inputData,
              type: 'summarization',
              options: summaryOptions
            }
          });
          
          if (error) throw error;
          
          return {
            output: {
              summary: aiResponse.summary,
              keyPoints: aiResponse.keyPoints || [],
              originalData: inputData
            }
          };
        }
        
        default:
          throw new Error(`Unknown AI operation: ${nodeData.subtype}`);
      }
    } catch (error) {
      console.error('Error in AI Analysis node:', error);
      throw error;
    }
  }
};

// Helper function to detect the data type of a value
export function detectDataType(value: any): string {
  if (value === null || value === undefined) {
    return "null";
  }
  
  if (Array.isArray(value)) {
    return "array";
  }
  
  if (value instanceof Date) {
    return "date";
  }
  
  return typeof value;
}

export default aiAnalysis;
