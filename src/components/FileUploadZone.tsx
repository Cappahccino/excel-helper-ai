
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileSpreadsheet } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { FILE_CONFIG } from "@/config/fileConfig";

interface FileUploadZoneProps {
  onFileUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  uploadProgress: number;
  currentFile: File | null;
  onReset: () => void;
}

export function FileUploadZone({
  onFileUpload,
  isUploading,
  uploadProgress,
  currentFile,
  onReset,
}: FileUploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) {
        onFileUpload(acceptedFiles[0]);
      }
    },
    [onFileUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FILE_CONFIG.ALLOWED_EXCEL_EXTENSIONS,
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
    maxSize: FILE_CONFIG.MAX_FILE_SIZE,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {currentFile ? (
        <div className="flex items-center gap-4 p-4 bg-zinc-900 rounded-lg text-white">
          <div className="flex items-center gap-3 flex-1">
            <FileSpreadsheet className="w-8 h-8 text-green-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{currentFile.name}</p>
              <p className="text-xs text-zinc-400">
                spreadsheet - {formatFileSize(currentFile.size)}
              </p>
            </div>
          </div>
          {isUploading && (
            <Progress 
              value={uploadProgress} 
              className="w-24"
              aria-label="Upload progress"
            />
          )}
          <Button
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            aria-label="Remove file"
          >
            Remove
          </Button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? "border-excel bg-excel/5" : "border-gray-300 hover:border-excel"
          }`}
          role="button"
          tabIndex={0}
          aria-label="Upload Excel file"
        >
          <input {...getInputProps()} aria-label="File input" />
          <div className="flex flex-col items-center gap-4">
            <FileSpreadsheet className="w-12 h-12 text-gray-400" aria-hidden="true" />
            <p className="text-lg font-medium">
              {isDragActive ? "Drop your Excel file here" : "Drag & drop your Excel file here"}
            </p>
            <p className="text-sm text-gray-500">or click to browse</p>
            <p className="text-xs text-gray-400">Maximum file size: 10MB</p>
          </div>
        </div>
      )}
    </div>
  );
}
