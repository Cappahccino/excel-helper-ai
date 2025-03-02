import { NodeInputs, NodeOutputs } from '@/types/workflow';

// AI Analysis functions
export const detectOutliers = async (
  inputs: NodeInputs,
  config: Record<string, any>
): Promise<NodeOutputs> => {
  try {
    const data = inputs.data || [];
    
    if (!Array.isArray(data) || data.length === 0) {
      return { data: [], outliers: [] };
    }
    
    // Simple outlier detection (z-score method)
    // In a real implementation, this would be more sophisticated
    const outliers = [];
    
    // Calculate mean and standard deviation for numeric fields
    const numericFields = Object.keys(data[0]).filter(key => 
      typeof data[0][key] === 'number'
    );
    
    const stats = numericFields.reduce((acc, field) => {
      const values = data.map(item => item[field]).filter(val => 
        typeof val === 'number' && !isNaN(val)
      );
      
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      
      const squareDiffs = values.map(value => Math.pow(value - mean, 2));
      const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
      const stdDev = Math.sqrt(avgSquareDiff);
      
      acc[field] = { mean, stdDev };
      return acc;
    }, {} as Record<string, { mean: number; stdDev: number }>);
    
    // Detect outliers using z-score
    // A z-score > 3 or < -3 is typically considered an outlier
    const threshold = config.threshold || 3;
    
    data.forEach((item, index) => {
      const itemOutliers: string[] = [];
      
      numericFields.forEach(field => {
        if (typeof item[field] === 'number' && !isNaN(item[field])) {
          const { mean, stdDev } = stats[field];
          
          // Avoid division by zero
          if (stdDev === 0) return;
          
          const zScore = Math.abs((item[field] - mean) / stdDev);
          
          if (zScore > threshold) {
            itemOutliers.push(field);
          }
        }
      });
      
      if (itemOutliers.length > 0) {
        outliers.push({
          index,
          item,
          outlierFields: itemOutliers,
        });
      }
    });
    
    return {
      data,
      outliers,
      analysis: {
        type: 'outlier_detection',
        count: outliers.length,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Error in outlier detection:', error);
    throw new Error(`AI analysis error: ${error}`);
  }
};

// Pattern recognition in data
export const findPatterns = async (
  inputs: NodeInputs,
  config: Record<string, any>
): Promise<NodeOutputs> => {
  try {
    const data = inputs.data || [];
    
    if (!Array.isArray(data) || data.length === 0) {
      return { data: [], patterns: [] };
    }
    
    // Simple pattern recognition
    // In a real implementation, this would use actual ML techniques
    const patterns = [];
    
    // Find frequency patterns in categorical data
    const categoricalFields = Object.keys(data[0]).filter(key => 
      typeof data[0][key] === 'string'
    );
    
    categoricalFields.forEach(field => {
      // Count occurrences of each value
      const valueCounts = data.reduce((counts, item) => {
        const value = item[field];
        if (typeof value === 'string') {
          counts[value] = (counts[value] || 0) + 1;
        }
        return counts;
      }, {} as Record<string, number>);
      
      // Find the most common values (top 3)
      const sortedValues = Object.entries(valueCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      if (sortedValues.length > 0) {
        patterns.push({
          type: 'frequency',
          field,
          values: sortedValues.map(([value, count]) => ({
            value,
            count,
            percentage: (count / data.length * 100).toFixed(1) + '%'
          }))
        });
      }
    });
    
    // Find trends in numeric data (simple linear trend)
    const numericFields = Object.keys(data[0]).filter(key => 
      typeof data[0][key] === 'number'
    );
    
    // Check if there's a time/sequence field to use for trend analysis
    const timeField = config.timeField || 
      Object.keys(data[0]).find(key => 
        key.toLowerCase().includes('date') || 
        key.toLowerCase().includes('time')
      );
    
    if (timeField) {
      // Sort data by the time field if possible
      const sortedData = [...data].sort((a, b) => {
        const aVal = a[timeField];
        const bVal = b[timeField];
        
        if (aVal instanceof Date && bVal instanceof Date) {
          return aVal.getTime() - bVal.getTime();
        }
        
        return String(aVal).localeCompare(String(bVal));
      });
      
      numericFields.forEach(field => {
        // Simple trend detection - compare first third to last third
        const third = Math.floor(sortedData.length / 3);
        if (third < 2) return; // Not enough data
        
        const firstThird = sortedData.slice(0, third);
        const lastThird = sortedData.slice(-third);
        
        const firstAvg = firstThird.reduce((sum, item) => sum + (item[field] || 0), 0) / third;
        const lastAvg = lastThird.reduce((sum, item) => sum + (item[field] || 0), 0) / third;
        
        const percentChange = ((lastAvg - firstAvg) / firstAvg) * 100;
        
        if (Math.abs(percentChange) > 10) { // 10% change threshold
          patterns.push({
            type: 'trend',
            field,
            direction: percentChange > 0 ? 'increasing' : 'decreasing',
            percentChange: Math.abs(percentChange).toFixed(1) + '%',
            startValue: firstAvg.toFixed(2),
            endValue: lastAvg.toFixed(2)
          });
        }
      });
    }
    
    return {
      data,
      patterns,
      analysis: {
        type: 'pattern_recognition',
        count: patterns.length,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Error in pattern recognition:', error);
    throw new Error(`AI analysis error: ${error}`);
  }
};

// Data summarization
export const summarizeData = async (
  inputs: NodeInputs,
  config: Record<string, any>
): Promise<NodeOutputs> => {
  try {
    const data = inputs.data || [];
    
    if (!Array.isArray(data) || data.length === 0) {
      return { data: [], summary: {} };
    }
    
    // Generate a summary of the data
    const summary: Record<string, any> = {
      rowCount: data.length,
      fields: {}
    };
    
    // Get all field names
    const fields = Object.keys(data[0] || {});
    
    fields.forEach(field => {
      const values = data.map(item => item[field]).filter(v => v !== null && v !== undefined);
      
      // Basic field info
      const fieldSummary: Record<string, any> = {
        type: typeof values[0],
        count: values.length,
        nullCount: data.length - values.length,
        nullPercentage: ((data.length - values.length) / data.length * 100).toFixed(1) + '%'
      };
      
      // Type-specific summaries
      if (typeof values[0] === 'number') {
        // Numeric field
        const numValues = values.filter(v => typeof v === 'number' && !isNaN(v)) as number[];
        
        if (numValues.length > 0) {
          const sorted = [...numValues].sort((a, b) => a - b);
          const sum = numValues.reduce((a, b) => a + b, 0);
          
          fieldSummary.min = sorted[0];
          fieldSummary.max = sorted[sorted.length - 1];
          fieldSummary.mean = sum / numValues.length;
          fieldSummary.median = sorted[Math.floor(sorted.length / 2)];
          
          // Calculate standard deviation
          const mean = fieldSummary.mean;
          const squareDiffs = numValues.map(value => Math.pow(value - mean, 2));
          const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
          fieldSummary.stdDev = Math.sqrt(avgSquareDiff);
        }
      } else if (typeof values[0] === 'string') {
        // String field
        const stringValues = values.filter(v => typeof v === 'string') as string[];
        
        if (stringValues.length > 0) {
          // Count unique values
          const uniqueValues = new Set(stringValues);
          fieldSummary.uniqueCount = uniqueValues.size;
          
          // Get most common values (top 5)
          const valueCounts = stringValues.reduce((counts, value) => {
            counts[value] = (counts[value] || 0) + 1;
            return counts;
          }, {} as Record<string, number>);
          
          fieldSummary.topValues = Object.entries(valueCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([value, count]) => ({
              value,
              count,
              percentage: (count / stringValues.length * 100).toFixed(1) + '%'
            }));
          
          // Check if it might be a date field
          const datePattern = /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}|^\d{2}-\d{2}-\d{4}/;
          const possibleDateCount = stringValues.filter(v => datePattern.test(v)).length;
          
          if (possibleDateCount > stringValues.length * 0.8) { // 80% match threshold
            fieldSummary.possibleDateField = true;
          }
        }
      } else if (values[0] instanceof Date) {
        // Date field
        const dateValues = values.filter(v => v instanceof Date) as Date[];
        
        if (dateValues.length > 0) {
          const timestamps = dateValues.map(d => d.getTime());
          const sorted = [...timestamps].sort((a, b) => a - b);
          
          fieldSummary.earliest = new Date(sorted[0]).toISOString();
          fieldSummary.latest = new Date(sorted[sorted.length - 1]).toISOString();
          fieldSummary.timeSpanDays = Math.round((sorted[sorted.length - 1] - sorted[0]) / (1000 * 60 * 60 * 24));
        }
      }
      
      summary.fields[field] = fieldSummary;
    });
    
    return {
      data,
      summary,
      analysis: {
        type: 'summarization',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Error in data summarization:', error);
    throw new Error(`AI analysis error: ${error}`);
  }
};
