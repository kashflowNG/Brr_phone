import { Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { DeviceModel } from "@shared/schema";

interface DeviceSelectorProps {
  devices: DeviceModel[];
  selectedDevice: string | null;
  onSelectDevice: (deviceId: string) => void;
}

export function DeviceSelector({ devices, selectedDevice, onSelectDevice }: DeviceSelectorProps) {
  if (devices.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground" data-testid="text-no-devices">
        <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No devices available</p>
      </div>
    );
  }

  return (
    <RadioGroup value={selectedDevice || ""} onValueChange={onSelectDevice}>
      <div className="space-y-3">
        {devices.map((device) => (
          <Card
            key={device.id}
            className={`
              p-4 cursor-pointer transition-all duration-200
              hover-elevate
              ${selectedDevice === device.id ? "ring-2 ring-primary" : ""}
              ${!device.available ? "opacity-50 cursor-not-allowed" : ""}
            `}
            onClick={() => device.available && onSelectDevice(device.id)}
            data-testid={`card-device-${device.id}`}
          >
            <div className="flex items-center gap-4">
              <RadioGroupItem 
                value={device.id} 
                id={device.id} 
                disabled={!device.available}
                data-testid={`radio-device-${device.id}`}
              />
              
              <div className="flex items-center gap-4 flex-1">
                <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-muted-foreground" />
                </div>

                <div className="flex-1 min-w-0">
                  <Label htmlFor={device.id} className="cursor-pointer">
                    <p className="text-lg font-medium truncate" data-testid={`text-device-name-${device.id}`}>
                      {device.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-1" data-testid={`text-device-specs-${device.id}`}>
                      {device.manufacturer} • Android {device.androidVersion}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono" data-testid={`text-device-screen-${device.id}`}>
                      {device.screenSize} • {device.resolution}
                    </p>
                  </Label>
                </div>

                {device.available ? (
                  <Badge variant="outline" className="text-xs" data-testid={`badge-available-${device.id}`}>
                    Available
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs" data-testid={`badge-unavailable-${device.id}`}>
                    Unavailable
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </RadioGroup>
  );
}
