
import { supabase } from '@/integrations/supabase/client';
import { NodeInputs, NodeOutputs } from '@/types/workflow';

// Helper functions for AI analysis
const calculateMean = (data: number[]): number => {
  if (!data.length) return 0;
  return data.reduce((sum, value) => sum + value, 0) / data.length;
};

const calculateStandardDeviation = (data: number[], mean: number): number => {
  if (!data.length) return 0;
  const squareDiffs = data.map(value => {
    const diff = value - mean;
    return diff * diff;
  });
  const avgSquareDiff = calculateMean(squareDiffs);
  return Math.sqrt(avgSquareDiff);
};

const findOutliers = (data: number[], mean: number, stdDev: number): number[] => {
  const threshold = 2; // Values more than 2 standard deviations from the mean
  return data.filter(value => Math.abs(value - mean) > threshold * stdDev);
};

const findPatterns = (data: number[]): any => {
  // Simple pattern detection - look for consistent increases or decreases
  const trends: any = {
    increasing: true,
    decreasing: true,
    stable: true
  };
  
  for (let i = 1; i < data.length; i++) {
    if (data[i] <= data[i-1]) trends.increasing = false;
    if (data[i] >= data[i-1]) trends.decreasing = false;
    if (Math.abs(data[i] - data[i-1]) > 0.1 * data[i-1]) trends.stable = false;
  }
  
  // Return detected pattern
  if (trends.increasing) return { pattern: 'increasing', confidence: 0.9 };
  if (trends.decreasing) return { pattern: 'decreasing', confidence: 0.9 };
  if (trends.stable) return { pattern: 'stable', confidence: 0.9 };
  
  return { pattern: 'mixed', confidence: 0.5 };
};

const prepareNumericData = (data: any[]): { numericColumns: string[], processedData: Record<string, number[]> } => {
  if (!data || !data.length) return { numericColumns: [], processedData: {} };
  
  // Find numeric columns
  const numericColumns: string[] = [];
  const firstRow = data[0];
  
  Object.keys(firstRow).forEach(key => {
    // Check if at least 70% of values are numeric
    const numericCount = data.filter(row => 
      row[key] !== undefined && 
      row[key] !== null && 
      !isNaN(Number(row[key]))
    ).length;
    
    if (numericCount > data.length * 0.7) {
      numericColumns.push(key);
    }
  });
  
  // Extract numeric values
  const processedData: Record<string, number[]> = {};
  
  numericColumns.forEach(column => {
    processedData[column] = data
      .map(row => Number(row[column]))
      .filter(val => !isNaN(val));
  });
  
  return { numericColumns, processedData };
};

// Main handler for AI analysis nodes
export const handleAiAnalysis = async (
  inputs: NodeInputs,
  config: Record<string, any>
): Promise<NodeOutputs> => {
  try {
    // Extract configuration
    const analysisType = config.analysisType || 'general';
    const shouldDetectOutliers = config.analysisOptions?.detectOutliers || false;
    const shouldFindPatterns = config.analysisOptions?.findPatterns || false;
    
    // Get input data
    const data = inputs.data || [];
    
    if (!data.length) {
      return {
        data: [],
        analysis: {
          message: 'No data to analyze',
          status: 'warning'
        }
      };
    }
    
    // Process data
    const { numericColumns, processedData } = prepareNumericData(data);
    
    if (numericColumns.length === 0) {
      return {
        data,
        analysis: {
          message: 'No numeric columns found for analysis',
          status: 'warning'
        }
      };
    }
    
    // Calculate statistics for each numeric column
    const statistics: Record<string, any> = {};
    
    numericColumns.forEach(column => {
      const columnData = processedData[column];
      const mean = calculateMean(columnData);
      const stdDev = calculateStandardDeviation(columnData, mean);
      const min = Math.min(...columnData);
      const max = Math.max(...columnData);
      
      statistics[column] = {
        mean,
        stdDev,
        min,
        max,
        count: columnData.length
      };
      
      // Optional analysis
      if (shouldDetectOutliers) {
        statistics[column].outliers = findOutliers(columnData, mean, stdDev);
      }
      
      if (shouldFindPatterns) {
        statistics[column].pattern = findPatterns(columnData);
      }
    });
    
    // Generate insights based on analysis type
    let insights: any[] = [];
    
    switch (analysisType) {
      case 'trends':
        insights = numericColumns.map(column => {
          const stats = statistics[column];
          const pattern = findPatterns(processedData[column]);
          return {
            column,
            insight: `Column ${column} shows a ${pattern.pattern} trend with ${pattern.confidence * 100}% confidence.`
          };
        });
        break;
        
      case 'outliers':
        insights = numericColumns
          .filter(column => statistics[column].outliers?.length > 0)
          .map(column => {
            const outliers = statistics[column].outliers;
            return {
              column,
              insight: `Found ${outliers.length} outliers in column ${column}.`,
              outliers
            };
          });
        break;
        
      case 'forecast':
        insights = numericColumns.map(column => {
          const data = processedData[column];
          const pattern = findPatterns(data);
          // Simple naive forecast based on pattern
          let forecast = 'stable';
          if (pattern.pattern === 'increasing') forecast = 'likely to continue increasing';
          if (pattern.pattern === 'decreasing') forecast = 'likely to continue decreasing';
          
          return {
            column,
            insight: `Column ${column} is ${forecast} based on historical trend.`
          };
        });
        break;
        
      default: // general analysis
        insights = numericColumns.map(column => {
          const stats = statistics[column];
          return {
            column,
            insight: `Column ${column} has mean ${stats.mean.toFixed(2)} with standard deviation ${stats.stdDev.toFixed(2)}.`
          };
        });
    }
    
    // Return processed data and analysis
    return {
      data,
      analysis: {
        statistics,
        insights,
        summary: `Analyzed ${numericColumns.length} numeric columns across ${data.length} records.`,
        status: 'success'
      }
    };
  } catch (error) {
    console.error('Error in AI analysis:', error);
    return {
      error: String(error),
      status: 'error'
    };
  }
};
