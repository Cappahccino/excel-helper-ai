// src/components/workflow/NodeLibrary.tsx

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search } from 'lucide-react';

interface NodeCategory {
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  nodes: string[];
}

interface NodeLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (nodeType: string) => void;
  nodeCategories: Record<string, NodeCategory>;
}

const NodeLibrary: React.FC<NodeLibraryProps> = ({
  isOpen,
  onClose,
  onAddNode,
  nodeCategories
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  
  // Filter nodes based on search term
  const filteredCategories = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return nodeCategories;
    }
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    const result: Record<string, NodeCategory> = {};
    
    for (const [key, category] of Object.entries(nodeCategories)) {
      if (category.label.toLowerCase().includes(lowerSearchTerm) || 
          category.description.toLowerCase().includes(lowerSearchTerm)) {
        // If the category matches, include all nodes
        result[key] = category;
      } else {
        // Filter nodes within the category
        const filteredNodes = category.nodes.filter(nodeType => {
          const nodeName = getNodeLabel(nodeType);
          return nodeName.toLowerCase().includes(lowerSearchTerm);
        });
        
        if (filteredNodes.length > 0) {
          result[key] = {
            ...category,
            nodes: filteredNodes
          };
        }
      }
    }
    
    return result;
  }, [searchTerm, nodeCategories]);
  
  // Helper function to get a readable label for a node type
  function getNodeLabel(nodeType: string): string {
    const labels: Record<string, string> = {
      excelInput: 'Excel Input',
      csvInput: 'CSV Input',
      apiSource: 'API Source',
      userInput: 'User Input',
      dataTransform: 'Transform Data',
      dataCleaning: 'Clean Data',
      formulaNode: 'Apply Formula',
      filterNode: 'Filter Data',
      aiAnalyze: 'AI Analysis',
      aiClassify: 'AI Classification',
      aiSummarize: 'AI Summary',
      xeroConnect: 'Xero Integration',
      salesforceConnect: 'Salesforce',
      googleSheetsConnect: 'Google Sheets',
      excelOutput: 'Excel Output',
      dashboardOutput: 'Dashboard',
      emailNotify: 'Email Notification',
      conditionalBranch: 'Condition',
      loopNode: 'Loop',
      mergeNode: 'Merge',
      spreadsheetGenerator: 'Spreadsheet Generator',
    };
    
    return labels[nodeType] || nodeType;
