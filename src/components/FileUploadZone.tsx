
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { FILE_CONFIG } from "@/config/fileConfig";

interface FileUploadZoneProps {
  onFileUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  uploadProgress: number;
  currentFile: File | null;
  onReset: () => void;
  onUploadComplete: () => void;
}

export function FileUploadZone({
  onFileUpload,
  isUploading,
  uploadProgress,
  currentFile,
  onReset,
  onUploadComplete,
}: FileUploadZoneProps) {
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) {
        try {
          await onFileUpload(acceptedFiles[0]);
          onUploadComplete();
        } catch (error) {
          console.error('Upload error:', error);
        }
      }
    },
    [onFileUpload, onUploadComplete]
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

  if (!currentFile || uploadProgress === 100) {
    return (
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 bg-white transition-all duration-200 ${
          isDragActive 
            ? "border-excel bg-excel/5" 
            : "border-gray-200 hover:border-excel/50 hover:bg-gray-50"
        }`}
        role="button"
        tabIndex={0}
        aria-label="Upload Excel file"
      >
        <input {...getInputProps()} aria-label="File input" />
        <div className="flex flex-col items-center gap-4">
          <Upload className="w-12 h-12 text-gray-400" aria-hidden="true" />
          <div className="text-center">
            <p className="text-lg font-medium text-gray-700">
              {isDragActive ? "Drop your Excel file here" : "Drag & Drop Excel File"}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Maximum file size: 10MB
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <FileSpreadsheet className="w-8 h-8 text-green-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 truncate">
              {currentFile.name}
            </p>
            <p className="text-xs text-gray-500">
              {formatFileSize(currentFile.size)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isUploading && (
            <div className="w-24">
              <Progress 
                value={uploadProgress} 
                className="h-1.5 bg-green-100"
                indicatorClassName="bg-green-500"
                aria-label="Upload progress"
              />
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            className="text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            aria-label="Remove file"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
