import { useState } from "react";
import { ApkUploader } from "@/components/apk-uploader";
import { ApkDetails } from "@/components/apk-details";
import { FileManager } from "@/components/file-manager";
import { Header } from "@/components/header";
import { useQuery } from "@tanstack/react-query";
import type { ApkFile } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";

export default function Home() {
  const [selectedApk, setSelectedApk] = useState<string | null>(null);

  // Fetch APK files
  const { data: apkFiles = [], refetch: refetchApks } = useQuery<ApkFile[]>({
    queryKey: ["/api/apk-files"],
  });

  const selectedApkFile = apkFiles.find((apk) => apk.id === selectedApk);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 py-6 h-full">
          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 h-full">
            {/* Left Sidebar */}
            <div className="space-y-6 overflow-y-auto">
              {/* APK Upload Section */}
              <section>
                <h2 className="text-xl font-medium mb-4" data-testid="text-upload-title">
                  Upload APK
                </h2>
                <ApkUploader onUploadComplete={refetchApks} />
              </section>

              {/* File Manager */}
              <section>
                <h2 className="text-xl font-medium mb-4" data-testid="text-files-title">
                  My APK Files
                </h2>
                <FileManager
                  apkFiles={apkFiles}
                  selectedApk={selectedApk}
                  onSelectApk={setSelectedApk}
                  onDelete={refetchApks}
                />
              </section>
            </div>

            {/* Main Content - APK Details */}
            <div className="flex flex-col h-full">
              {selectedApkFile ? (
                <ApkDetails apkFile={selectedApkFile} />
              ) : (
                <Card className="h-full flex flex-col items-center justify-center p-8 gap-6" data-testid="card-empty-state">
                  <Package className="w-24 h-24 text-muted-foreground opacity-50" />
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-medium" data-testid="text-empty-title">
                      No APK Selected
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md" data-testid="text-empty-description">
                      Upload an APK file or select one from your library to view installation instructions, download links, and QR codes
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
