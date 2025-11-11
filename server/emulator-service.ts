
import FormData from 'form-data';
import fs from 'fs';

/**
 * Emulator Service - Appetize.io Integration
 * 
 * This service integrates with Appetize.io cloud-based Android emulators
 * 
 * Setup:
 * 1. Sign up at https://appetize.io
 * 2. Get your API token from the dashboard
 * 3. Add APPETIZE_API_TOKEN to Secrets in Replit
 */

export class EmulatorService {
  private apiToken: string;
  private baseUrl = 'https://api.appetize.io/v1';
  private sessions: Map<string, string> = new Map();

  constructor() {
    this.apiToken = process.env.APPETIZE_API_TOKEN || '';
    
    if (!this.apiToken) {
      console.warn('⚠️  APPETIZE_API_TOKEN not found in environment variables');
      console.warn('⚠️  Add your Appetize.io API token to Secrets to enable real emulator sessions');
    }
  }

  /**
   * Start an emulator session
   * @param sessionId - Internal session ID
   * @param apkPath - Path to the APK file
   * @param deviceId - Device model ID
   * @returns Session URL for embedding
   */
  async startSession(sessionId: string, apkPath: string, deviceId: string): Promise<string> {
    if (!this.apiToken) {
      // Fallback to demo mode if no API token
      return this.startDemoSession(sessionId);
    }

    try {
      // Step 1: Upload APK to Appetize.io
      const publicKey = await this.uploadApk(apkPath);
      
      // Step 2: Generate streaming URL with device configuration
      const sessionUrl = this.generateSessionUrl(publicKey, deviceId);
      
      // Store the mapping for cleanup later
      this.sessions.set(sessionId, publicKey);
      
      console.log(`✅ Emulator session started: ${publicKey}`);
      return sessionUrl;
    } catch (error) {
      console.error('❌ Error starting emulator session:', error);
      throw new Error('Failed to start emulator session. Please check your Appetize.io API token.');
    }
  }

  /**
   * Upload APK to Appetize.io
   * @param apkPath - Local path to APK file
   * @returns Public key for the uploaded app
   */
  private async uploadApk(apkPath: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(apkPath));
    formData.append('platform', 'android');

    const response = await fetch(`${this.baseUrl}/apps`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
      },
      body: formData as any,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Appetize.io upload failed: ${error}`);
    }

    const data = await response.json();
    return data.publicKey;
  }

  /**
   * Generate streaming URL for the emulator
   * @param publicKey - App's public key from Appetize.io
   * @param deviceId - Device model ID
   * @returns Embeddable streaming URL
   */
  private generateSessionUrl(publicKey: string, deviceId: string): string {
    // Map our device IDs to Appetize.io device names
    const deviceMap: Record<string, string> = {
      'pixel-6-pro': 'pixel6pro',
      'galaxy-s21': 'galaxys21',
      'oneplus-9': 'oneplus9',
    };

    const appetizeDevice = deviceMap[deviceId] || 'pixel6pro';
    
    // Construct embed URL with parameters
    const params = new URLSearchParams({
      device: appetizeDevice,
      scale: '75',
      autoplay: 'true',
      orientation: 'portrait',
      deviceColor: 'black',
      params: JSON.stringify({
        audio: true,
      }),
    });

    return `https://appetize.io/embed/${publicKey}?${params.toString()}`;
  }

  /**
   * Demo mode fallback when no API token is configured
   */
  private async startDemoSession(sessionId: string): Promise<string> {
    console.log('ℹ️  Running in demo mode (no Appetize.io API token)');
    await this.delay(2000);
    
    const publicKey = `demo-${sessionId.substring(0, 8)}`;
    const mockSessionUrl = `https://demo-emulator.example.com/session/${publicKey}`;
    
    this.sessions.set(sessionId, publicKey);
    return mockSessionUrl;
  }

  /**
   * Stop an emulator session
   * @param publicKey - Public key or session identifier from cloud service
   */
  async stopSession(publicKey: string): Promise<void> {
    if (!this.apiToken || publicKey.startsWith('demo-')) {
      // Demo mode cleanup
      this.sessions.forEach((key, sessionId) => {
        if (key === publicKey) {
          this.sessions.delete(sessionId);
        }
      });
      return;
    }

    try {
      // Delete the app from Appetize.io to free up quota
      const response = await fetch(`${this.baseUrl}/apps/${publicKey}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
        },
      });

      if (response.ok) {
        console.log(`✅ Emulator session stopped: ${publicKey}`);
      }
    } catch (error) {
      console.error('❌ Error stopping emulator session:', error);
    }

    // Clean up local tracking
    this.sessions.forEach((key, sessionId) => {
      if (key === publicKey) {
        this.sessions.delete(sessionId);
      }
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
