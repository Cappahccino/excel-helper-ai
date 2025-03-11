import { 
  FileInput,
  Layers, 
  LayoutDashboard, 
  Text, 
  Search, 
  Filter 
} from 'lucide-react';

export const nodeCategories = [
  {
    name: 'Input',
    icon: <FileInput className="h-5 w-5" />,
    nodes: [
      {
        type: 'dataInput',
        label: 'Data Input',
        description: 'Manually input data',
        category: 'input',
        icon: <Text className="h-5 w-5" />,
      },
      {
        type: 'fileUpload',
        label: 'File Upload',
        description: 'Upload a file to process',
        category: 'input',
        icon: <LayoutDashboard className="h-5 w-5" />,
      },
      {
        type: 'spreadsheetGenerator',
        label: 'Spreadsheet Generator',
        description: 'Generate a spreadsheet with sample data',
        category: 'input',
        icon: <LayoutDashboard className="h-5 w-5" />,
      },
    ]
  },
  {
    name: 'Processing',
    icon: <Layers className="h-5 w-5" />,
    nodes: [
      {
        type: 'filtering',
        label: 'Filter',
        description: 'Filter data based on conditions',
        category: 'processing',
        icon: <Filter className="h-5 w-5" />,
      },
      {
        type: 'sorting',
        label: 'Sort',
        description: 'Sort data based on a column',
        category: 'processing',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'aggregation',
        label: 'Aggregate',
        description: 'Aggregate data based on a column',
        category: 'processing',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'formulaCalculation',
        label: 'Formula Calculation',
        description: 'Calculate a new column based on a formula',
        category: 'processing',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'textTransformation',
        label: 'Text Transformation',
        description: 'Transform text in a column',
        category: 'processing',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'dataTypeConversion',
        label: 'Data Type Conversion',
        description: 'Convert data type of a column',
        category: 'processing',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'dateFormatting',
        label: 'Date Formatting',
        description: 'Format date in a column',
        category: 'processing',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'pivotTable',
        label: 'Pivot Table',
        description: 'Create a pivot table',
        category: 'processing',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'joinMerge',
        label: 'Join/Merge',
        description: 'Join/Merge two data sets',
        category: 'processing',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'deduplication',
        label: 'Deduplication',
        description: 'Remove duplicate rows',
        category: 'processing',
        icon: <Search className="h-5 w-5" />,
      },
    ]
  },
  {
    name: 'AI',
    icon: <Layers className="h-5 w-5" />,
    nodes: [
      {
        type: 'askAI',
        label: 'Ask AI',
        description: 'Ask AI a question about the data',
        category: 'ai',
        icon: <Search className="h-5 w-5" />,
      },
    ]
  },
  {
    name: 'Output',
    icon: <Layers className="h-5 w-5" />,
    nodes: [
      {
        type: 'jsonOutput',
        label: 'JSON Output',
        description: 'Output data as JSON',
        category: 'output',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'tableOutput',
        label: 'Table Output',
        description: 'Output data as Table',
        category: 'output',
        icon: <Search className="h-5 w-5" />,
      },
    ]
  },
  {
    name: 'Integration',
    icon: <Layers className="h-5 w-5" />,
    nodes: [
      {
        type: 'httpIntegration',
        label: 'HTTP Integration',
        description: 'Send data to an HTTP endpoint',
        category: 'integration',
        icon: <Search className="h-5 w-5" />,
      },
    ]
  },
  {
    name: 'Control',
    icon: <Layers className="h-5 w-5" />,
    nodes: [
      {
        type: 'conditionalSplit',
        label: 'Conditional Split',
        description: 'Split data based on a condition',
        category: 'control',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'looping',
        label: 'Looping',
        description: 'Loop through data',
        category: 'control',
        icon: <Search className="h-5 w-5" />,
      },
    ]
  },
  {
    name: 'Utility',
    icon: <Layers className="h-5 w-5" />,
    nodes: [
      {
        type: 'dataValidation',
        label: 'Data Validation',
        description: 'Validate data',
        category: 'utility',
        icon: <Search className="h-5 w-5" />,
      },
      {
        type: 'dataEnrichment',
        label: 'Data Enrichment',
        description: 'Enrich data',
        category: 'utility',
        icon: <Search className="h-5 w-5" />,
      },
    ]
  },
];
