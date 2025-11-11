import { useState } from "react";
import { ApkUploader } from "@/components/apk-uploader";
import { DeviceSelector } from "@/components/device-selector";
import { EmulatorViewer } from "@/components/emulator-viewer";
import { FileManager } from "@/components/file-manager";
import { Header } from "@/components/header";
import { useQuery } from "@tanstack/react-query";
import type { ApkFile, DeviceModel, EmulatorSession } from "@shared/schema";

export default function Home() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<EmulatorSession | null>(null);
  const [selectedApk, setSelectedApk] = useState<string | null>(null);

  // Fetch APK files
  const { data: apkFiles = [], refetch: refetchApks } = useQuery<ApkFile[]>({
    queryKey: ["/api/apk-files"],
  });

  // Fetch available devices
  const { data: devices = [] } = useQuery<DeviceModel[]>({
    queryKey: ["/api/devices"],
  });

  // Fetch active session
  const { data: session, refetch: refetchSession } = useQuery<EmulatorSession | null>({
    queryKey: ["/api/session/active"],
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header sessionStatus={session?.status || "idle"} />
      
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

              {/* Device Selection */}
              <section>
                <h2 className="text-xl font-medium mb-4" data-testid="text-device-title">
                  Select Device
                </h2>
                <DeviceSelector
                  devices={devices}
                  selectedDevice={selectedDevice}
                  onSelectDevice={setSelectedDevice}
                />
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
                  onRun={(apkId) => {
                    setSelectedApk(apkId);
                    setActiveSession(null);
                  }}
                />
              </section>
            </div>

            {/* Main Content - Emulator Viewer */}
            <div className="flex flex-col h-full">
              <EmulatorViewer
                session={session}
                selectedApk={selectedApk}
                selectedDevice={selectedDevice}
                onSessionStart={(newSession) => {
                  setActiveSession(newSession);
                  refetchSession();
                }}
                onSessionEnd={() => {
                  setActiveSession(null);
                  refetchSession();
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
