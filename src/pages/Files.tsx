
import React from 'react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { FileInfo } from '@/components/FileInfo';
import { useFileUpload } from '@/hooks/useFileUpload';

const Files = () => {
  const {
    file,
    isUploading,
    uploadProgress,
    handleFileUpload,
    resetUpload,
  } = useFileUpload();

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">My Files</h1>
      <div className="space-y-6">
        <FileUploadZone 
          onFileUpload={handleFileUpload}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          currentFile={file}
          onReset={resetUpload}
        />
        {file && (
          <FileInfo
            filename={file.name}
            fileSize={file.size}
          />
        )}
      </div>
    </div>
  );
};

export default Files;

