import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Smartphone, Code, QrCode as QrCodeIcon, Copy, Check } from "lucide-react";
import type { ApkFile } from "@shared/schema";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ApkDetailsProps {
  apkFile: ApkFile;
}

export function ApkDetails({ apkFile }: ApkDetailsProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const downloadUrl = `${window.location.origin}/api/apk-files/${apkFile.id}/download`;
  const adbCommand = `adb install ${apkFile.originalName}`;

  useEffect(() => {
    QRCode.toDataURL(downloadUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    })
      .then(setQrCodeDataUrl)
      .catch(console.error);
  }, [downloadUrl]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ ...copied, [key]: true });
      setTimeout(() => {
        setCopied({ ...copied, [key]: false });
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className="h-full flex flex-col" data-testid="card-apk-details">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate" data-testid="text-apk-name">
              {apkFile.originalName}
            </CardTitle>
            <CardDescription className="mt-2 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" data-testid="badge-file-size">
                  {formatFileSize(apkFile.size)}
                </Badge>
                <span className="text-xs text-muted-foreground" data-testid="text-upload-date">
                  Uploaded {formatDate(apkFile.uploadedAt)}
                </span>
              </div>
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <a href={downloadUrl} download data-testid="link-download">
              <Button size="default" data-testid="button-download">
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </a>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-qr-code">
                  <QrCodeIcon className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-qr-code">
                <DialogHeader>
                  <DialogTitle>Scan to Download</DialogTitle>
                  <DialogDescription>
                    Scan this QR code with your Android device to download the APK
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-center p-4">
                  {qrCodeDataUrl && (
                    <img
                      src={qrCodeDataUrl}
                      alt="QR Code for APK download"
                      className="rounded-md border"
                      data-testid="img-qr-code"
                    />
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <Tabs defaultValue="instructions" data-testid="tabs-apk-details">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="instructions" data-testid="tab-instructions">
              <Smartphone className="mr-2 h-4 w-4" />
              Install
            </TabsTrigger>
            <TabsTrigger value="adb" data-testid="tab-adb">
              <Code className="mr-2 h-4 w-4" />
              ADB
            </TabsTrigger>
            <TabsTrigger value="link" data-testid="tab-link">
              <Download className="mr-2 h-4 w-4" />
              Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="instructions" className="space-y-4 mt-4">
            <div className="space-y-3">
              <h3 className="font-medium">Install on Android Device</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Download the APK file to your Android device</li>
                <li>Open the downloaded file from your notification bar or file manager</li>
                <li>If prompted, enable "Install from Unknown Sources" in Settings</li>
                <li>Tap "Install" and wait for the installation to complete</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h3 className="font-medium">Install on Emulator</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Open Android Studio and launch your emulator</li>
                <li>Drag and drop the APK file onto the emulator window</li>
                <li>The app will install automatically</li>
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="adb" className="space-y-4 mt-4">
            <div className="space-y-3">
              <h3 className="font-medium">Install via ADB</h3>
              <p className="text-sm text-muted-foreground">
                Use Android Debug Bridge to install the APK on a connected device or emulator:
              </p>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
                  <code data-testid="text-adb-command">{adbCommand}</code>
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(adbCommand, "adb")}
                  data-testid="button-copy-adb"
                >
                  {copied.adb ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground mt-4">
                <li>Download the APK to your computer</li>
                <li>Connect your Android device via USB with USB debugging enabled</li>
                <li>Navigate to the download folder in your terminal</li>
                <li>Run the command above</li>
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="link" className="space-y-4 mt-4">
            <div className="space-y-3">
              <h3 className="font-medium">Direct Download Link</h3>
              <p className="text-sm text-muted-foreground">
                Share this link to allow others to download the APK:
              </p>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto break-all">
                  <code data-testid="text-download-url">{downloadUrl}</code>
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(downloadUrl, "url")}
                  data-testid="button-copy-url"
                >
                  {copied.url ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
