
import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface SyncButtonProps {
  onClick: () => Promise<void>;
  disabled: boolean;
}

const SyncButton: React.FC<SyncButtonProps> = ({ onClick, disabled }) => {
  return (
    <Button 
      size="sm" 
      variant="outline" 
      className="w-full text-xs mt-2 transition-all duration-300 animate-fade-in shadow-sm border-gray-200 hover:bg-blue-50 hover:border-blue-300 group"
      onClick={onClick}
      disabled={disabled}
    >
      <RefreshCw className="h-3 w-3 mr-2 group-hover:rotate-180 transition-transform duration-500" />
      Sync Schema with Connected Nodes
    </Button>
  );
};

export default SyncButton;
