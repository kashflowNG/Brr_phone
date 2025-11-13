import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { Search, Globe, Code, Download } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface ApiEndpoint {
  url: string;
  method: string;
  headers?: Record<string, string>;
  payload?: any;
  dbOperation?: string;
  logicTypes?: string[];
  source?: string;
}

interface ScanResult {
  endpoints: ApiEndpoint[];
  scripts: string[];
  totalEndpoints: number;
  databaseOperations?: {
    'INSERT/CREATE': number;
    'UPDATE/EDIT': number;
    'DELETE/REMOVE': number;
    'UPSERT/MERGE': number;
    'BULK_OPERATIONS': number;
    'READ/SELECT': number;
  };
  serverLogic?: {
    auth: number;
    admin: number;
    upload: number;
    security: number;
    workflow: number;
    database: number;
  };
}

export function ApiScanner() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanResults, setScanResults] = useState<ScanResult | null>(null);

  const scanMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<ScanResult>("POST", "/api/scan-webapp", { url });
    },
    onSuccess: (data) => {
      setScanResults(data);
      toast({
        title: "Scan completed",
        description: `Found ${data.totalEndpoints} API endpoints`,
      });
      setScanProgress(0);
    },
    onError: (error: Error) => {
      toast({
        title: "Scan failed",
        description: error.message,
        variant: "destructive",
      });
      setScanProgress(0);
    },
  });

  const handleScan = () => {
    if (!url) {
      toast({
        title: "URL required",
        description: "Please enter a web app URL to scan",
        variant: "destructive",
      });
      return;
    }

    try {
      new URL(url);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    setScanProgress(50);
    setScanResults(null);
    scanMutation.mutate();
  };

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      GET: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
      POST: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
      PUT: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
      DELETE: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
      PATCH: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    };
    return colors[method] || "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20";
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webapp-url">Web Application URL</Label>
            <div className="flex gap-2">
              <Input
                id="webapp-url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={scanMutation.isPending}
                data-testid="input-webapp-url"
              />
              <Button
                onClick={handleScan}
                disabled={scanMutation.isPending || !url}
                size="lg"
                data-testid="button-scan-webapp"
              >
                <Search className="w-4 h-4 mr-2" />
                Scan
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter a web app URL to discover its API endpoints
            </p>
          </div>
        </div>
      </Card>

      {scanProgress > 0 && !scanResults && (
        <Card className="p-6">
          <div className="space-y-2">
            <Progress value={scanProgress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center" data-testid="text-scan-progress">
              Scanning web application...
            </p>
          </div>
        </Card>
      )}

      {scanResults && (
        <div className="space-y-4">
          {scanResults.databaseOperations && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">INSERT/CREATE</div>
                <div className="text-2xl font-bold text-green-600">{scanResults.databaseOperations['INSERT/CREATE']}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">UPDATE/EDIT</div>
                <div className="text-2xl font-bold text-blue-600">{scanResults.databaseOperations['UPDATE/EDIT']}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">DELETE/REMOVE</div>
                <div className="text-2xl font-bold text-red-600">{scanResults.databaseOperations['DELETE/REMOVE']}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">READ/SELECT</div>
                <div className="text-2xl font-bold text-purple-600">{scanResults.databaseOperations['READ/SELECT']}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">UPSERT/MERGE</div>
                <div className="text-2xl font-bold text-yellow-600">{scanResults.databaseOperations['UPSERT/MERGE']}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-1">BULK OPS</div>
                <div className="text-2xl font-bold text-orange-600">{scanResults.databaseOperations['BULK_OPERATIONS']}</div>
              </Card>
            </div>
          )}

          {scanResults.serverLogic && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Server Logic Analysis</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auth:</span>
                  <Badge variant="outline">{scanResults.serverLogic.auth}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin:</span>
                  <Badge variant="outline">{scanResults.serverLogic.admin}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Upload:</span>
                  <Badge variant="outline">{scanResults.serverLogic.upload}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Security:</span>
                  <Badge variant="outline">{scanResults.serverLogic.security}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Workflow:</span>
                  <Badge variant="outline">{scanResults.serverLogic.workflow}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Database:</span>
                  <Badge variant="outline">{scanResults.serverLogic.database}</Badge>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Discovered API Endpoints
                <Badge variant="secondary" className="ml-auto">
                  {scanResults.totalEndpoints} found
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {scanResults.endpoints.map((endpoint, index) => (
                    <Card key={index} className="p-4" data-testid={`endpoint-${index}`}>
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 flex-wrap">
                          <Badge className={getMethodColor(endpoint.method)}>
                            {endpoint.method}
                          </Badge>
                          {endpoint.dbOperation && (
                            <Badge variant="outline" className="text-xs">
                              DB: {endpoint.dbOperation}
                            </Badge>
                          )}
                          {endpoint.logicTypes && endpoint.logicTypes.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {endpoint.logicTypes.join(', ')}
                            </Badge>
                          )}
                          {endpoint.source && (
                            <Badge variant="outline" className="text-xs opacity-60">
                              {endpoint.source}
                            </Badge>
                          )}
                          <code className="text-sm flex-1 break-all font-mono bg-muted px-2 py-1 rounded-md">
                            {endpoint.url}
                          </code>
                        </div>

                        {endpoint.headers && Object.keys(endpoint.headers).length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Code className="w-3 h-3 text-muted-foreground" />
                              <p className="text-xs font-medium text-muted-foreground">Headers</p>
                            </div>
                            <div className="bg-muted rounded-md p-3">
                              <pre className="text-xs font-mono overflow-x-auto">
                                {JSON.stringify(endpoint.headers, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}

                        {endpoint.payload && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Download className="w-3 h-3 text-muted-foreground" />
                              <p className="text-xs font-medium text-muted-foreground">Payload</p>
                            </div>
                            <div className="bg-muted rounded-md p-3">
                              <pre className="text-xs font-mono overflow-x-auto">
                                {JSON.stringify(endpoint.payload, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {scanResults.scripts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  JavaScript Files
                  <Badge variant="secondary" className="ml-auto">
                    {scanResults.scripts.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {scanResults.scripts.map((script, index) => (
                      <div key={index}>
                        <code className="text-sm break-all font-mono">
                          {script}
                        </code>
                        {index < scanResults.scripts.length - 1 && (
                          <Separator className="my-2" />
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
