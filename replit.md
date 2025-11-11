# Android Emulator Platform

## Overview

A web-based Android emulator platform that allows users to upload APK files and run them in cloud-based emulator sessions directly in the browser. The application provides a streamlined interface for managing APK files, selecting device configurations, and viewing emulator sessions through embedded streaming URLs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- Path aliases configured for clean imports (`@/`, `@shared/`, `@assets/`)

**UI Component Library**
- Shadcn UI component system based on Radix UI primitives
- Material Design 3 design language with Roboto font family
- Tailwind CSS for utility-first styling with custom HSL-based color system
- Component variants managed through class-variance-authority
- Responsive design with mobile-first breakpoints (768px mobile breakpoint)

**State Management**
- TanStack Query (React Query) for server state management and data fetching
- Local component state for UI interactions
- Query client configured with automatic refetching disabled

**Key UI Components**
- APK Uploader: Drag-and-drop file upload zone with file validation (APK only, 200MB limit)
- Device Selector: Radio group interface for selecting Android device models
- Emulator Viewer: Iframe-based display for emulator session streaming
- File Manager: List view for uploaded APK files with delete/run actions
- Header: Application header with session status badge

**Design System**
- Two-column layout: 320px fixed sidebar, fluid main content area
- Stacks to single column on mobile
- Tailwind spacing primitives (2, 4, 6, 8 units)
- Card-based UI with elevation effects (hover-elevate, active-elevate-2 classes)
- Material Icons for iconography

### Backend Architecture

**Runtime & Framework**
- Node.js with Express.js REST API
- TypeScript with ESNext modules
- Development server with hot module replacement via Vite middleware
- Production build uses esbuild for server bundling

**API Structure**
- RESTful endpoints under `/api` prefix
- Multer middleware for multipart file uploads (APK files)
- File storage in local `uploads/` directory
- JSON request/response bodies
- Session-based architecture (no authentication implemented)

**Core Services**
- EmulatorService: Mock implementation for cloud emulator integration
  - Designed to integrate with services like Appetize.io or NativeBridge
  - Simulates 2-second API delay for demo purposes
  - Returns mock session URLs for development
  - Placeholder for real APK upload and streaming session creation

**API Endpoints**
- `GET /api/apk-files` - List all uploaded APK files
- `POST /api/apk-files/upload` - Upload APK file (multipart/form-data)
- `DELETE /api/apk-files/:id` - Delete APK file
- `GET /api/devices` - List available device models
- `GET /api/session/active` - Get current active emulator session
- `POST /api/session/start` - Start new emulator session
- `POST /api/session/stop` - Stop current emulator session

**Error Handling**
- Custom error middleware with JSON responses
- File validation (APK extension only, 200MB size limit)
- HTTP status codes for different error types
- Request logging with duration tracking for API endpoints

### Data Storage

**Database Configuration**
- Drizzle ORM with PostgreSQL dialect
- Schema location: `shared/schema.ts`
- Migrations output to `./migrations`
- Environment-based database URL configuration

**Schema Design**

*APK Files Table*
- Auto-generated UUID primary keys
- Stores filename, original name, file size, upload timestamp, and file path
- Zod validation schemas generated from Drizzle schema

*Emulator Sessions Table*
- Tracks session lifecycle: idle, initializing, running, stopped, error
- Links to APK file and device configuration
- Stores session URL and public key for cloud service integration
- Timestamps for creation, start, and stop events

*Device Models*
- In-memory data structure (not persisted in database)
- Defines available Android device configurations (Pixel 6 Pro, Galaxy S21, etc.)
- Includes device specifications: Android version, screen size, resolution, availability status

**Current Implementation**
- MemStorage class provides in-memory fallback implementation
- Maps used for APK files and sessions storage
- Designed to be replaced with actual Drizzle database queries
- CRUD operations defined through IStorage interface

### External Dependencies

**Cloud Emulator Services**
- Prepared for integration with Appetize.io or NativeBridge APIs
- Requires API key configuration via environment variables
- APK upload to cloud service endpoint
- Session streaming URL retrieval
- Currently mocked with demo implementation

**Database**
- Neon Database serverless PostgreSQL (via @neondatabase/serverless)
- PostgreSQL connection pooling with connect-pg-simple
- DATABASE_URL environment variable required

**CDN Resources**
- Google Fonts: Roboto (regular, medium, mono variants)
- Material Icons font for UI iconography

**File Storage**
- Local filesystem storage for uploaded APK files
- Upload directory: `process.cwd()/uploads`
- Multer diskStorage with unique filename generation (timestamp + random suffix)

**Development Tools**
- Replit-specific plugins for development (cartographer, dev-banner, runtime error modal)
- Only loaded in non-production Replit environments