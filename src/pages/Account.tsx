
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, CreditCard, Database, FileText, Shield } from 'lucide-react';
import { ProfileTab } from '@/components/account/ProfileTab';
import { SubscriptionTab } from '@/components/account/SubscriptionTab';
import { UsageTab } from '@/components/account/UsageTab';
import { ConnectedAppsTab } from '@/components/account/ConnectedAppsTab';
import { SecurityTab } from '@/components/account/SecurityTab';

const TAB_CONTENT = [
  {
    title: "Profile",
    icon: User,
    key: "profile",
    component: ProfileTab
  },
  {
    title: "Subscription",
    icon: CreditCard,
    key: "subscription",
    component: SubscriptionTab
  },
  {
    title: "Usage",
    icon: Database,
    key: "usage",
    component: UsageTab
  },
  {
    title: "Connected Apps",
    icon: FileText,
    key: "apps",
    component: ConnectedAppsTab
  },
  {
    title: "Security",
    icon: Shield,
    key: "security",
    component: SecurityTab
  }
] as const;

export default function Account() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Account Settings</h1>
        
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {TAB_CONTENT.map(({ title, icon: Icon, key }) => (
              <TabsTrigger 
                key={key} 
                value={key}
                className="flex items-center gap-2 w-full"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{title}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_CONTENT.map(({ key, component: Component }) => (
            <TabsContent key={key} value={key}>
              <Component />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
