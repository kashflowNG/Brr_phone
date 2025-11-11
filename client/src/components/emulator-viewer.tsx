
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Smartphone,
  QrCode,
  Download,
  CheckCircle2,
  Info
} from "lucide-react";
import type { ApkFile } from "@shared/schema";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface EmulatorViewerProps {
  session: any;
  selectedApk: string | null;
  selectedDevice: string | null;
  onSessionStart: (session: any) => void;
  onSessionEnd: () => void;
  apkFile?: ApkFile;
}

export function EmulatorViewer({
  selectedApk,
  apkFile,
}: EmulatorViewerProps) {
  const { toast } = useToast();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  useEffect(() => {
    if (apkFile) {
      const downloadUrl = `${window.location.origin}/api/apk-files/${apkFile.id}/download`;
      
      QRCode.toDataURL(downloadUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then(setQrCodeUrl)
        .catch((err) => {
          console.error("Error generating QR code:", err);
          toast({
            title: "QR Code Error",
            description: "Failed to generate QR code",
            variant: "destructive",
          });
        });
    }
  }, [apkFile, toast]);

  const handleCopyLink = () => {
    if (apkFile) {
      const downloadUrl = `${window.location.origin}/api/apk-files/${apkFile.id}/download`;
      navigator.clipboard.writeText(downloadUrl);
      toast({
        title: "Link copied",
        description: "Download link copied to clipboard",
      });
    }
  };

  const handleDownload = () => {
    if (apkFile) {
      window.location.href = `/api/apk-files/${apkFile.id}/download`;
    }
  };

  if (!selectedApk || !apkFile) {
    return (
      <Card className="h-full flex flex-col items-center justify-center p-8 gap-6">
        <Smartphone className="w-24 h-24 text-muted-foreground opacity-50" />
        <div className="text-center space-y-2">
          <h3 className="text-xl font-medium">No APK Selected</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Select an APK file to install it on your Android device
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              Install on Your Android Device
            </CardTitle>
            <CardDescription>
              Use your phone's built-in features to install {apkFile.originalName}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Method 1: QR Code */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Method 1: Scan QR Code
            </CardTitle>
            <CardDescription>
              Easiest way - Use your phone's camera app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              {qrCodeUrl && (
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code for APK download" 
                  className="border-4 border-border rounded-lg"
                />
              )}
              <div className="text-center space-y-2">
                <p className="text-sm font-medium">Scan with your phone to download</p>
                <ol className="text-sm text-muted-foreground space-y-1 text-left">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                    Open your phone's camera app
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                    Point it at the QR code above
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                    Tap the notification to download
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                    Open the downloaded APK file to install
                  </li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Method 2: Direct Download */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Method 2: Direct Download Link
            </CardTitle>
            <CardDescription>
              Copy the link or download directly
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={handleDownload} 
                className="flex-1"
                size="lg"
              >
                <Download className="w-4 h-4 mr-2" />
                Download APK
              </Button>
              <Button 
                onClick={handleCopyLink} 
                variant="outline"
                className="flex-1"
                size="lg"
              >
                Copy Link
              </Button>
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium">If browsing on your phone:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Click "Download APK" button above</li>
                <li>Open the downloaded file from your notification bar</li>
                <li>Enable "Install from Unknown Sources" if prompted</li>
                <li>Tap "Install" and you're done!</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Method 3: Device Features */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              Method 3: Using Device Built-in Features
            </CardTitle>
            <CardDescription>
              Share via Bluetooth, Nearby Share, or AirDrop alternatives
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium">Alternative sharing methods:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Nearby Share (Android):</strong> Download on this device, then share to your phone</li>
                <li><strong>Bluetooth:</strong> Transfer the APK file directly via Bluetooth</li>
                <li><strong>Cloud Storage:</strong> Upload to Google Drive/Dropbox and download on your phone</li>
                <li><strong>Email:</strong> Email the download link to yourself and open on your phone</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Important Note */}
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Info className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium text-orange-900 dark:text-orange-100">
                  Security Note
                </p>
                <p className="text-orange-800 dark:text-orange-200">
                  Make sure to enable "Install from Unknown Sources" in your Android settings if this is your first time installing an APK outside the Play Store.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
