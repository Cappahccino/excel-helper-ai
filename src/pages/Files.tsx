
import React from 'react';
import { FileUploadZone } from '@/components/FileUploadZone';
import { FileInfo } from '@/components/FileInfo';

const Files = () => {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">My Files</h1>
      <div className="space-y-6">
        <FileUploadZone />
        <FileInfo />
      </div>
    </div>
  );
};

export default Files;
