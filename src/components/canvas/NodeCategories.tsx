
import { FileText, Database, CircleHelp, Bot, Download, Cpu, SendToBack, Binary, Filter, SortAsc } from 'lucide-react';

// Node categories, items, and nodeTypes must match!
export const nodeCategories = [
  {
    id: 'input',
    name: 'Data Input',
    items: [
      {
        type: 'dataInput',
        label: 'Input Field',
        description: 'Add an input field to your workflow',
        icon: CircleHelp,
      },
      {
        type: 'fileUpload',
        label: 'File Upload',
        description: 'Upload and process a file',
        icon: FileText,
      },
    ],
  },
  {
    id: 'processing',
    name: 'Data Processing',
    items: [
      {
        type: 'dataProcessing',
        label: 'Data Processing',
        description: 'Process and transform data',
        icon: Database,
      },
      {
        type: 'filtering',
        label: 'Filter Data',
        description: 'Filter data based on criteria',
        icon: Filter,
      },
      {
        type: 'spreadsheetGenerator',
        label: 'Spreadsheet Generator',
        description: 'Generate spreadsheet from template',
        icon: FileText,
      },
    ],
  },
  {
    id: 'ai',
    name: 'AI',
    items: [
      {
        type: 'aiNode',
        label: 'AI',
        description: 'Generate content with AI',
        icon: Bot,
      },
      {
        type: 'askAI',
        label: 'Ask AI',
        description: 'Ask AI questions about your data',
        icon: CircleHelp,
      },
    ],
  },
  {
    id: 'output',
    name: 'Output',
    items: [
      {
        type: 'outputNode',
        label: 'Output',
        description: 'Send data to output',
        icon: Download,
      },
    ],
  },
  {
    id: 'control',
    name: 'Control',
    items: [
      {
        type: 'controlNode',
        label: 'Control',
        description: 'Control the flow of your workflow',
        icon: Cpu,
      },
    ],
  },
  {
    id: 'utility',
    name: 'Utility',
    items: [
      {
        type: 'utilityNode',
        label: 'Utility',
        description: 'Utility functions',
        icon: SendToBack,
      },
      {
        type: 'expandable',
        label: 'Expandable',
        description: 'Collapsible node for organization',
        icon: Binary,
      },
    ],
  },
];
