
import React, { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileSpreadsheet, X, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { FILE_CONFIG } from "@/config/fileConfig";
import { cn } from "@/lib/utils";

interface FileDropZoneProps {
  onFileUpload: (files: File[]) => Promise<string | null>;
  isUploading: boolean;
  uploadProgress: number;
  currentFile: File | null;
  onReset: () => void;
  disabled?: boolean;
}

export function FileDropZone({
  onFileUpload,
  isUploading,
  uploadProgress,
  currentFile,
  onReset,
  disabled = false,
}: FileDropZoneProps) {
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && !disabled) {
        await onFileUpload(acceptedFiles);
      }
    },
    [onFileUpload, disabled]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FILE_CONFIG.ALLOWED_EXCEL_EXTENSIONS,
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
    maxSize: FILE_CONFIG.MAX_FILE_SIZE,
    disabled: isUploading || !!currentFile || disabled
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!currentFile) {
    return (
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 transition-all duration-200",
          isDragActive && !isDragReject ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300",
          isDragReject && "border-red-400 bg-red-50",
          disabled && "opacity-50 cursor-not-allowed",
          "h-[80px] flex items-center justify-center"
        )}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload Excel file"
      >
        <input {...getInputProps()} aria-label="File input" disabled={disabled} />
        <div className="flex flex-col items-center gap-1">
          <Upload className="w-5 h-5 text-gray-400 mb-1" aria-hidden="true" />
          <p className="text-xs text-center text-gray-600">
            {isDragActive 
              ? (isDragReject ? "File type not supported" : "Drop your file here") 
              : "Drag & Drop or Click to Browse"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileSpreadsheet className="w-5 h-5 text-green-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">
              {currentFile.name}
            </p>
            <p className="text-[10px] text-gray-500">
              {formatFileSize(currentFile.size)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isUploading && (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            className="w-6 h-6 p-0 text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            disabled={isUploading || disabled}
            aria-label="Remove file"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {isUploading && (
        <Progress 
          value={uploadProgress} 
          className="h-1 mt-2 bg-blue-100" 
          indicatorClassName="bg-blue-500"
          aria-label="Upload progress"
        />
      )}
    </div>
  );
}
