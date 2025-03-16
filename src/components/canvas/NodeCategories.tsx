
import { Upload, Filter, PlusCircle, Brain, FileSpreadsheet, Calculator } from 'lucide-react';

export const nodeCategories = [
  {
    id: 'input',
    name: 'Input',
    items: [
      {
        type: 'fileUpload',
        label: 'File Upload',
        description: 'Upload and process Excel, CSV or other file formats',
        icon: Upload
      }
    ]
  },
  {
    id: 'processing',
    name: 'Processing',
    items: [
      {
        type: 'filtering',
        label: 'Filter',
        description: 'Filter data based on specific conditions',
        icon: Filter
      },
      {
        type: 'aggregation',
        label: 'Aggregate',
        description: 'Perform aggregations like sum, average, min, max',
        icon: Calculator
      },
      {
        type: 'dataProcessing',
        label: 'Process Data',
        description: 'Clean, transform, and manipulate data',
        icon: PlusCircle
      }
    ]
  },
  {
    id: 'ai',
    name: 'AI',
    items: [
      {
        type: 'aiNode',
        label: 'AI Analysis',
        description: 'Analyze data using AI',
        icon: Brain
      },
      {
        type: 'askAI',
        label: 'Ask AI',
        description: 'Ask AI questions about your data',
        icon: Brain
      }
    ]
  },
  {
    id: 'output',
    name: 'Output',
    items: [
      {
        type: 'spreadsheetGenerator',
        label: 'Spreadsheet',
        description: 'Generate Excel or CSV files',
        icon: FileSpreadsheet
      }
    ]
  }
];
