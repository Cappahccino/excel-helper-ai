
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from '@/integrations/supabase/client';
import { ButtonColorful } from "@/components/ui/button-colorful";

interface UsageStats {
  totalFiles: number;
  totalSize: number;
}

export function UsageTab() {
  const [usageStats, setUsageStats] = useState<UsageStats>({
    totalFiles: 0,
    totalSize: 0
  });

  useEffect(() => {
    async function getUsageStats() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('excel_files')
          .select('file_size')
          .eq('user_id', user.id);
        
        if (data) {
          const totalSize = data.reduce((acc, file) => acc + (file.file_size || 0), 0);
          setUsageStats({
            totalFiles: data.length,
            totalSize
          });
        }
      }
    }
    getUsageStats();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Message Usage</CardTitle>
          <CardDescription>Your current message usage and limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span>Messages sent</span>
                <span>0</span>
              </div>
              <div className="flex justify-between">
                <span>Messages remaining</span>
                <span>0</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>File Storage</CardTitle>
          <CardDescription>Your current storage usage and limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span>Files uploaded</span>
                <span>{usageStats.totalFiles}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Storage used</span>
                <span>{formatBytes(usageStats.totalSize)}</span>
              </div>
              <div className="flex justify-between">
                <span>Storage remaining</span>
                <span>Unlimited</span>
              </div>
            </div>
            <ButtonColorful label="Upgrade Plan" className="w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
