
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from 'lucide-react';
import { ButtonColorful } from "@/components/ui/button-colorful";

export function SubscriptionTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>You are currently on the Free plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <h3 className="font-semibold">Included in your plan:</h3>
            <ul className="space-y-2">
              {[
                'Basic Excel file analysis',
                'Limited message quota',
                'Standard support',
                'Basic file storage'
              ].map((feature, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <ButtonColorful className="mt-6" label="Upgrade Plan" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
