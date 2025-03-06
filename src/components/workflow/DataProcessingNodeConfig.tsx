
import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tag, X, Plus } from 'lucide-react';
import { ProcessingNodeType } from '@/types/workflow';

interface DataProcessingNodeConfigProps {
  nodeId: string;
  config: any;
  type: ProcessingNodeType;
  onConfigChange: (config: any) => void;
}

export function DataProcessingNodeConfig({ nodeId, config, type, onConfigChange }: DataProcessingNodeConfigProps) {
  const [localConfig, setLocalConfig] = useState(config || {});

  useEffect(() => {
    setLocalConfig(config || {});
  }, [config]);

  const handleChange = (field: string, value: any) => {
    const updatedConfig = { ...localConfig, [field]: value };
    setLocalConfig(updatedConfig);
    onConfigChange(updatedConfig);
  };

  const addArrayItem = (field: string, item: string) => {
    if (!item.trim()) return;
    const currentArray = localConfig[field] || [];
    if (!currentArray.includes(item)) {
      const updatedArray = [...currentArray, item];
      handleChange(field, updatedArray);
    }
  };

  const removeArrayItem = (field: string, index: number) => {
    const currentArray = localConfig[field] || [];
    const updatedArray = currentArray.filter((_, i) => i !== index);
    handleChange(field, updatedArray);
  };

  const renderFilteringConfig = () => (
    <>
      <div className="mb-4">
        <Label htmlFor="column">Column to Filter</Label>
        <Input
          id="column"
          value={localConfig.column || ''}
          onChange={(e) => handleChange('column', e.target.value)}
          placeholder="Enter column name"
        />
      </div>
      <div className="mb-4">
        <Label htmlFor="operator">Operator</Label>
        <Select 
          value={localConfig.operator || 'equals'} 
          onValueChange={(value) => handleChange('operator', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select operator" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">Equals</SelectItem>
            <SelectItem value="notEquals">Not Equals</SelectItem>
            <SelectItem value="contains">Contains</SelectItem>
            <SelectItem value="greaterThan">Greater Than</SelectItem>
            <SelectItem value="lessThan">Less Than</SelectItem>
            <SelectItem value="startsWith">Starts With</SelectItem>
            <SelectItem value="endsWith">Ends With</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mb-4">
        <Label htmlFor="value">Filter Value</Label>
        <Input
          id="value"
          value={localConfig.value || ''}
          onChange={(e) => handleChange('value', e.target.value)}
          placeholder="Enter filter value"
        />
      </div>
    </>
  );

  const renderSortingConfig = () => {
    const [newColumn, setNewColumn] = useState('');
    
    return (
      <>
        <div className="mb-4">
          <Label htmlFor="order">Sort Order</Label>
          <Select 
            value={localConfig.order || 'ascending'} 
            onValueChange={(value) => handleChange('order', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select sort order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ascending">Ascending</SelectItem>
              <SelectItem value="descending">Descending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mb-4">
          <Label className="mb-2 block">Columns to Sort</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(localConfig.columns || []).map((col: string, index: number) => (
              <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
                <span className="text-sm">{col}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeArrayItem('columns', index)}
                  className="ml-1 p-0 h-4 w-4"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              placeholder="Enter column name"
            />
            <Button
              type="button"
              onClick={() => {
                addArrayItem('columns', newColumn);
                setNewColumn('');
              }}
              disabled={!newColumn.trim()}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>
      </>
    );
  };

  const renderAggregationConfig = () => (
    <>
      <div className="mb-4">
        <Label htmlFor="function">Aggregation Function</Label>
        <Select 
          value={localConfig.function || 'sum'} 
          onValueChange={(value) => handleChange('function', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select function" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sum">Sum</SelectItem>
            <SelectItem value="average">Average</SelectItem>
            <SelectItem value="count">Count</SelectItem>
            <SelectItem value="min">Minimum</SelectItem>
            <SelectItem value="max">Maximum</SelectItem>
            <SelectItem value="median">Median</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mb-4">
        <Label htmlFor="column">Column for Aggregation</Label>
        <Input
          id="column"
          value={localConfig.column || ''}
          onChange={(e) => handleChange('column', e.target.value)}
          placeholder="Enter column name"
        />
      </div>
      <div className="mb-4">
        <Label htmlFor="groupBy">Group By (Optional)</Label>
        <Input
          id="groupBy"
          value={localConfig.groupBy || ''}
          onChange={(e) => handleChange('groupBy', e.target.value)}
          placeholder="Enter grouping column"
        />
      </div>
    </>
  );

  const renderFormulaCalculationConfig = () => (
    <>
      <div className="mb-4">
        <Label htmlFor="description">Formula Description</Label>
        <Textarea
          id="description"
          value={localConfig.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Describe what the formula should do, e.g., 'Calculate the compound interest based on principal, rate, and time'"
          rows={4}
        />
      </div>
    </>
  );

  const renderTextTransformationConfig = () => (
    <>
      <div className="mb-4">
        <Label htmlFor="column">Column to Transform</Label>
        <Input
          id="column"
          value={localConfig.column || ''}
          onChange={(e) => handleChange('column', e.target.value)}
          placeholder="Enter column name"
        />
      </div>
      <div className="mb-4">
        <Label htmlFor="transformation">Transformation Type</Label>
        <Select 
          value={localConfig.transformation || 'uppercase'} 
          onValueChange={(value) => handleChange('transformation', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select transformation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="uppercase">UPPERCASE</SelectItem>
            <SelectItem value="lowercase">lowercase</SelectItem>
            <SelectItem value="capitalize">Capitalize</SelectItem>
            <SelectItem value="trim">Trim Whitespace</SelectItem>
            <SelectItem value="replace">Find and Replace</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {localConfig.transformation === 'replace' && (
        <>
          <div className="mb-4">
            <Label htmlFor="find">Find</Label>
            <Input
              id="find"
              value={localConfig.find || ''}
              onChange={(e) => handleChange('find', e.target.value)}
              placeholder="Text to find"
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="replace">Replace With</Label>
            <Input
              id="replace"
              value={localConfig.replace || ''}
              onChange={(e) => handleChange('replace', e.target.value)}
              placeholder="Replacement text"
            />
          </div>
        </>
      )}
      {localConfig.transformation === 'custom' && (
        <div className="mb-4">
          <Label htmlFor="customTransformation">Custom Transformation</Label>
          <Textarea
            id="customTransformation"
            value={localConfig.customTransformation || ''}
            onChange={(e) => handleChange('customTransformation', e.target.value)}
            placeholder="Describe the custom transformation, e.g., 'Extract phone numbers from text'"
            rows={3}
          />
        </div>
      )}
    </>
  );

  const renderDataTypeConversionConfig = () => (
    <>
      <div className="mb-4">
        <Label htmlFor="column">Column to Convert</Label>
        <Input
          id="column"
          value={localConfig.column || ''}
          onChange={(e) => handleChange('column', e.target.value)}
          placeholder="Enter column name"
        />
      </div>
      <div className="mb-4">
        <Label htmlFor="fromType">From Type</Label>
        <Select 
          value={localConfig.fromType || 'text'} 
          onValueChange={(value) => handleChange('fromType', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select source type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="boolean">Boolean</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mb-4">
        <Label htmlFor="toType">To Type</Label>
        <Select 
          value={localConfig.toType || 'number'} 
          onValueChange={(value) => handleChange('toType', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select target type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="boolean">Boolean</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const renderDateFormattingConfig = () => (
    <>
      <div className="mb-4">
        <Label htmlFor="column">Date Column</Label>
        <Input
          id="column"
          value={localConfig.column || ''}
          onChange={(e) => handleChange('column', e.target.value)}
          placeholder="Enter column name"
        />
      </div>
      <div className="mb-4">
        <Label htmlFor="format">Date Format</Label>
        <Select 
          value={localConfig.format || 'MM/DD/YYYY'} 
          onValueChange={(value) => handleChange('format', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select date format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
            <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
            <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
            <SelectItem value="MMM DD, YYYY">MMM DD, YYYY</SelectItem>
            <SelectItem value="DD MMM YYYY">DD MMM YYYY</SelectItem>
            <SelectItem value="custom">Custom Format</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {localConfig.format === 'custom' && (
        <div className="mb-4">
          <Label htmlFor="customFormat">Custom Format</Label>
          <Input
            id="customFormat"
            value={localConfig.customFormat || ''}
            onChange={(e) => handleChange('customFormat', e.target.value)}
            placeholder="Enter custom format, e.g., YYYY-MM-DD HH:mm:ss"
          />
        </div>
      )}
    </>
  );

  const renderPivotTableConfig = () => {
    const [newRow, setNewRow] = useState('');
    const [newColumn, setNewColumn] = useState('');
    const [newValue, setNewValue] = useState('');
    
    return (
      <>
        <div className="mb-4">
          <Label className="mb-2 block">Row Fields</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(localConfig.rows || []).map((row: string, index: number) => (
              <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
                <span className="text-sm">{row}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeArrayItem('rows', index)}
                  className="ml-1 p-0 h-4 w-4"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newRow}
              onChange={(e) => setNewRow(e.target.value)}
              placeholder="Enter row field"
            />
            <Button
              type="button"
              onClick={() => {
                addArrayItem('rows', newRow);
                setNewRow('');
              }}
              disabled={!newRow.trim()}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>
        
        <div className="mb-4">
          <Label className="mb-2 block">Column Fields</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(localConfig.columns || []).map((col: string, index: number) => (
              <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
                <span className="text-sm">{col}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeArrayItem('columns', index)}
                  className="ml-1 p-0 h-4 w-4"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              placeholder="Enter column field"
            />
            <Button
              type="button"
              onClick={() => {
                addArrayItem('columns', newColumn);
                setNewColumn('');
              }}
              disabled={!newColumn.trim()}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>
        
        <div className="mb-4">
          <Label className="mb-2 block">Value Fields</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(localConfig.values || []).map((val: string, index: number) => (
              <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
                <span className="text-sm">{val}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeArrayItem('values', index)}
                  className="ml-1 p-0 h-4 w-4"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Enter value field"
            />
            <Button
              type="button"
              onClick={() => {
                addArrayItem('values', newValue);
                setNewValue('');
              }}
              disabled={!newValue.trim()}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>
      </>
    );
  };

  const renderJoinMergeConfig = () => (
    <>
      <div className="mb-4">
        <Label htmlFor="leftKey">Primary Dataset Key</Label>
        <Input
          id="leftKey"
          value={localConfig.leftKey || ''}
          onChange={(e) => handleChange('leftKey', e.target.value)}
          placeholder="Enter key column from primary dataset"
        />
      </div>
      <div className="mb-4">
        <Label htmlFor="rightKey">Secondary Dataset Key</Label>
        <Input
          id="rightKey"
          value={localConfig.rightKey || ''}
          onChange={(e) => handleChange('rightKey', e.target.value)}
          placeholder="Enter key column from secondary dataset"
        />
      </div>
      <div className="mb-4">
        <Label htmlFor="joinType">Join Type</Label>
        <Select 
          value={localConfig.joinType || 'inner'} 
          onValueChange={(value) => handleChange('joinType', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select join type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inner">Inner Join</SelectItem>
            <SelectItem value="left">Left Join</SelectItem>
            <SelectItem value="right">Right Join</SelectItem>
            <SelectItem value="full">Full Outer Join</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const renderDeduplicationConfig = () => {
    const [newColumn, setNewColumn] = useState('');
    
    return (
      <>
        <div className="mb-4">
          <Label className="mb-2 block">Columns for Deduplication</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(localConfig.columns || []).map((col: string, index: number) => (
              <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
                <span className="text-sm">{col}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeArrayItem('columns', index)}
                  className="ml-1 p-0 h-4 w-4"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              placeholder="Enter column name"
            />
            <Button
              type="button"
              onClick={() => {
                addArrayItem('columns', newColumn);
                setNewColumn('');
              }}
              disabled={!newColumn.trim()}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Switch 
            id="caseSensitive"
            checked={localConfig.caseSensitive ?? true}
            onCheckedChange={(checked) => handleChange('caseSensitive', checked)}
          />
          <Label htmlFor="caseSensitive">Case Sensitive Comparison</Label>
        </div>
      </>
    );
  };

  // Render different configuration forms based on the node type
  const renderConfigFields = () => {
    switch (type) {
      case 'filtering':
        return renderFilteringConfig();
      case 'sorting':
        return renderSortingConfig();
      case 'aggregation':
        return renderAggregationConfig();
      case 'formulaCalculation':
        return renderFormulaCalculationConfig();
      case 'textTransformation':
        return renderTextTransformationConfig();
      case 'dataTypeConversion':
        return renderDataTypeConversionConfig();
      case 'dateFormatting':
        return renderDateFormattingConfig();
      case 'pivotTable':
        return renderPivotTableConfig();
      case 'joinMerge':
        return renderJoinMergeConfig();
      case 'deduplication':
        return renderDeduplicationConfig();
      default:
        return <p className="text-sm text-gray-500">No configuration available for this node type.</p>;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="nodeLabel">Node Label</Label>
        <Input
          id="nodeLabel"
          value={localConfig.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          placeholder="Enter node label"
        />
      </div>
      
      <div className="pt-4 border-t">
        <h3 className="font-medium mb-3">Operation Configuration</h3>
        {renderConfigFields()}
      </div>
    </div>
  );
}
