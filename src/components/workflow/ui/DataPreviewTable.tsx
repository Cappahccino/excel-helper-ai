
import React from 'react';

interface DataPreviewTableProps {
  columns: string[];
  data: any[];
  maxRows?: number;
  highlightFilters?: {
    column: string;
    condition: string;
    value: any;
  }[];
  className?: string;
}

const DataPreviewTable: React.FC<DataPreviewTableProps> = ({
  columns,
  data,
  maxRows = 5,
  highlightFilters = [],
  className
}) => {
  if (!data || data.length === 0 || !columns || columns.length === 0) {
    return (
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-500 italic">
        No preview data available
      </div>
    );
  }

  // Limit rows to display
  const displayData = data.slice(0, maxRows);

  // Cell highlight evaluation function
  const shouldHighlight = (columnName: string, value: any) => {
    for (const filter of highlightFilters) {
      if (filter.column !== columnName) continue;

      switch (filter.condition) {
        case 'equals':
          return value === filter.value;
        case 'not-equals':
          return value !== filter.value;
        case 'greater-than':
          return typeof value === 'number' && value > Number(filter.value);
        case 'less-than':
          return typeof value === 'number' && value < Number(filter.value);
        case 'contains':
          return typeof value === 'string' && value.includes(filter.value);
        case 'starts-with':
          return typeof value === 'string' && value.startsWith(filter.value);
        case 'ends-with':
          return typeof value === 'string' && value.endsWith(filter.value);
        default:
          return false;
      }
    }
    return false;
  };

  return (
    <div className={`overflow-x-auto border border-gray-200 rounded-md ${className}`}>
      <table className="min-w-full divide-y divide-gray-200 text-xs">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column, idx) => (
              <th 
                key={idx} 
                className="px-2 py-1.5 text-left text-gray-500 font-medium truncate max-w-[150px]"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {displayData.map((row, rowIdx) => (
            <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {columns.map((column, colIdx) => {
                const cellValue = row[column];
                const isHighlighted = shouldHighlight(column, cellValue);
                
                return (
                  <td 
                    key={colIdx} 
                    className={`px-2 py-1.5 whitespace-nowrap truncate max-w-[150px] ${
                      isHighlighted ? 'bg-yellow-100 text-yellow-800' : ''
                    }`}
                    title={String(cellValue)}
                  >
                    {cellValue === null || cellValue === undefined 
                      ? <span className="text-gray-400 italic">null</span> 
                      : String(cellValue)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {data.length > maxRows && (
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td 
                colSpan={columns.length} 
                className="px-2 py-1 text-xs text-center text-gray-500"
              >
                Showing {maxRows} of {data.length} rows
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};

export default DataPreviewTable;
