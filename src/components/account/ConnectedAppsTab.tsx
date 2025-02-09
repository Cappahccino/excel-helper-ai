
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ConnectedAppsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Apps</CardTitle>
        <CardDescription>Manage your connected applications</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Coming soon...
        </div>
      </CardContent>
    </Card>
  );
}
