
import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { SpreadsheetGeneratorNodeData } from '@/types/workflow';
import { PlusCircle, Trash2 } from 'lucide-react';

interface SpreadsheetGeneratorNodeConfigProps {
  node: {
    id: string;
    data: SpreadsheetGeneratorNodeData;
  };
  onConfigChange: (nodeId: string, config: any) => void;
}

const SpreadsheetGeneratorNodeConfig: React.FC<SpreadsheetGeneratorNodeConfigProps> = ({
  node,
  onConfigChange,
}) => {
  const [config, setConfig] = useState(node.data.config || {});

  // Initialize with default values
  useEffect(() => {
    const defaultConfig = {
      filename: 'generated',
      fileExtension: 'xlsx' as 'xlsx' | 'csv' | 'xls',
      sheets: [{ name: 'Sheet1', columns: [] }],
      ...node.data.config
    };
    setConfig(defaultConfig);
  }, [node.data.config]);

  const handleChange = (key: string, value: any) => {
    const updatedConfig = { ...config, [key]: value };
    setConfig(updatedConfig);
    onConfigChange(node.id, updatedConfig);
  };

  const handleAddSheet = () => {
    const sheets = [...(config.sheets || []), { name: `Sheet${(config.sheets?.length || 0) + 1}`, columns: [] }];
    handleChange('sheets', sheets);
  };

  const handleRemoveSheet = (index: number) => {
    const sheets = [...(config.sheets || [])];
    sheets.splice(index, 1);
    handleChange('sheets', sheets);
  };

  const handleUpdateSheet = (index: number, sheetData: any) => {
    const sheets = [...(config.sheets || [])];
    sheets[index] = { ...sheets[index], ...sheetData };
    handleChange('sheets', sheets);
  };

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle>Spreadsheet Generator Configuration</CardTitle>
      </CardHeader>
      <CardContent className="px-0 space-y-4">
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="filename">Filename</Label>
            <Input
              id="filename"
              value={config.filename || 'generated'}
              onChange={(e) => handleChange('filename', e.target.value)}
              placeholder="Enter filename without extension"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="fileExtension">File Format</Label>
            <Select
              value={config.fileExtension || 'xlsx'}
              onValueChange={(value: 'xlsx' | 'csv' | 'xls') => handleChange('fileExtension', value)}
            >
              <SelectTrigger id="fileExtension">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
                <SelectItem value="xls">Excel 97-2003 (.xls)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Sheets</Label>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleAddSheet}
              className="flex items-center gap-1"
            >
              <PlusCircle className="h-4 w-4" />
              Add Sheet
            </Button>
          </div>
          
          {config.sheets && config.sheets.length > 0 ? (
            <div className="space-y-4">
              {config.sheets.map((sheet: any, index: number) => (
                <div key={index} className="flex items-center space-x-2 border p-2 rounded">
                  <Input
                    value={sheet.name}
                    onChange={(e) => handleUpdateSheet(index, { name: e.target.value })}
                    placeholder="Sheet name"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveSheet(index)}
                    disabled={config.sheets.length <= 1}
                    title="Remove sheet"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">No sheets added yet</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SpreadsheetGeneratorNodeConfig;
