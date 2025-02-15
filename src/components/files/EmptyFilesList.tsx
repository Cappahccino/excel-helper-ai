
import { FileSpreadsheet } from 'lucide-react';

export function EmptyFilesList() {
  return (
    <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
      <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-4 text-sm font-medium text-gray-900">No files</h3>
      <p className="mt-1 text-sm text-gray-500">Upload a file to get started</p>
    </div>
  );
}
