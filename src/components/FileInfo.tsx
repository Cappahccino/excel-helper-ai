
import { FileSpreadsheet } from "lucide-react";

interface FileInfoProps {
  filename: string;
  fileSize?: number;
}

export function FileInfo({ filename, fileSize }: FileInfoProps) {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-zinc-900 rounded-lg text-white">
      <div className="flex items-center gap-3 flex-1">
        <FileSpreadsheet className="w-8 h-8 text-green-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{filename}</p>
          {fileSize && (
            <p className="text-xs text-zinc-400">
              spreadsheet - {formatFileSize(fileSize)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
