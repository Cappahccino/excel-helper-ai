
import { FileSpreadsheet, HardDrive, Clock } from 'lucide-react';

interface FileStatsProps {
  totalFiles: number;
  totalStorage: number;
}

export function FileStats({ totalFiles, totalStorage }: FileStatsProps) {
  const formatStorage = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-green-50 rounded-lg">
            <FileSpreadsheet className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Files</p>
            <p className="text-2xl font-semibold">{totalFiles}</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-50 rounded-lg">
            <HardDrive className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Storage Used</p>
            <p className="text-2xl font-semibold">{formatStorage(totalStorage)}</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Clock className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Last Upload</p>
            <p className="text-2xl font-semibold">Today</p>
          </div>
        </div>
      </div>
    </div>
  );
}
