
import React, { useState, useMemo } from 'react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, X, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConnectionState } from '@/hooks/useSchemaConnection';
import { Skeleton } from '@/components/ui/skeleton';

interface SchemaColumnSelectorProps {
  schema: SchemaColumn[];
  selectedColumn?: string;
  onChange: (column: string) => void;
  isLoading: boolean;
  connectionState: ConnectionState;
  hasSourceNode: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const SchemaColumnSelector: React.FC<SchemaColumnSelectorProps> = ({
  schema,
  selectedColumn,
  onChange,
  isLoading,
  connectionState,
  hasSourceNode,
  placeholder = "Select column",
  className = "",
  disabled = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredSchema = useMemo(() => {
    if (!searchTerm) return schema;
    
    return schema.filter(column => 
      column.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [schema, searchTerm]);
  
  const defaultPlaceholder = hasSourceNode 
    ? (isLoading ? "Loading columns..." : "Select a column") 
    : "Connect a source first";
  
  if (isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }
  
  return (
    <div className={className}>
      {schema.length > 5 && (
        <div className="relative mb-2">
          <Input
            placeholder="Search columns..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-8 text-xs pl-8"
            disabled={!hasSourceNode || schema.length === 0 || disabled}
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2" />
          {searchTerm && (
            <X 
              className="w-4 h-4 text-gray-400 absolute right-2 top-2 cursor-pointer hover:text-gray-600" 
              onClick={() => setSearchTerm('')}
            />
          )}
        </div>
      )}
      
      <Select
        value={selectedColumn || ''}
        onValueChange={onChange}
        disabled={isLoading || schema.length === 0 || !hasSourceNode || disabled}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={placeholder || defaultPlaceholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[240px]">
          {schema.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-gray-500">
              {hasSourceNode ? "No columns available" : "Connect a source first"}
            </div>
          ) : filteredSchema.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-gray-500">
              No columns match your search
            </div>
          ) : (
            <ScrollArea className="h-full max-h-[220px]">
              {filteredSchema.map((column) => (
                <SelectItem key={column.name} value={column.name}>
                  <div className="flex items-center">
                    {column.name}
                    <Badge variant="outline" className="ml-2 text-[9px] py-0 h-4">
                      {column.type}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </ScrollArea>
          )}
        </SelectContent>
      </Select>
      
      {hasSourceNode ? (
        isLoading ? (
          <div className="text-xs text-blue-600 mt-1 flex items-center">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Loading columns...
          </div>
        ) : schema.length > 0 ? (
          <div className="text-xs text-blue-600 mt-1">
            {schema.length} column{schema.length !== 1 ? 's' : ''} available
            {searchTerm && filteredSchema.length !== schema.length && (
              <span> ({filteredSchema.length} filtered)</span>
            )}
          </div>
        ) : connectionState === ConnectionState.CONNECTED ? (
          <div className="text-xs text-amber-600 mt-1">
            Connected but no columns found
          </div>
        ) : null
      ) : (
        <div className="text-xs text-blue-600 mt-1">
          Connect an input to this node
        </div>
      )}
    </div>
  );
};

export default SchemaColumnSelector;
