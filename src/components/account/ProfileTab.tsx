
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export function ProfileTab() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    async function getProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('first_name, last_name, email')
          .eq('id', user.id)
          .single();
        setProfile(data);
      }
    }
    getProfile();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <p className="text-lg">{profile?.first_name} {profile?.last_name}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <p className="text-lg">{profile?.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Current Plan</label>
            <p className="text-lg">Free</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
