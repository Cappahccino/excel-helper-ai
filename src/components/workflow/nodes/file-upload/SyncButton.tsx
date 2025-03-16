
import React from 'react';
import { Button } from '@/components/ui/button';

interface SyncButtonProps {
  onClick: () => Promise<void>;
  disabled: boolean;
}

const SyncButton: React.FC<SyncButtonProps> = ({ onClick, disabled }) => {
  return (
    <Button 
      size="sm" 
      variant="outline" 
      className="w-full text-xs mt-2"
      onClick={onClick}
      disabled={disabled}
    >
      Sync Schema with Connected Nodes
    </Button>
  );
};

export default SyncButton;
