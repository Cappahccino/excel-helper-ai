
import { FileStats } from '@/components/files/FileStats';
import { FileUploadZone } from '@/components/FileUploadZone';

interface FilesHeaderProps {
  totalFiles: number;
  totalStorage: number;
  onFileUpload: (files: File[]) => Promise<void>;
  isUploading: boolean;
  uploadProgress: Record<string, number>;
  currentFiles: File[] | null;
  onReset: () => void;
  onUploadComplete: () => Promise<void>;
}

export function FilesHeader({
  totalFiles,
  totalStorage,
  onFileUpload,
  isUploading,
  uploadProgress,
  currentFiles,
  onReset,
  onUploadComplete,
}: FilesHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Files</h1>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <FileStats 
          totalFiles={totalFiles}
          totalStorage={totalStorage}
        />
        
        <FileUploadZone 
          onFileUpload={onFileUpload}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          currentFiles={currentFiles}
          onReset={onReset}
          onUploadComplete={onUploadComplete}
        />
      </div>
    </div>
  );
}
