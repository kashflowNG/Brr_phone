import { Package } from "lucide-react";

export function Header() {
  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6" data-testid="header-main">
      <div className="flex items-center gap-3">
        <Package className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-medium" data-testid="text-app-title">
          APK Manager
        </h1>
      </div>
    </header>
  );
}
