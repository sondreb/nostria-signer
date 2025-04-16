import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from '@tauri-apps/api/app';

// Add declaration for Tauri's global window property
declare global {
  interface Window {
    __TAURI__?: any;
  }
}

@Injectable({
    providedIn: 'root'
})
export class TauriService {
    useBrowserStorage = true; // Default to browser storage for safety
    private isRunningInTauri = false;
    
    constructor() {
        // Check if running in Tauri environment
        this.checkTauriEnvironment();
    }
    
    private async checkTauriEnvironment(): Promise<void> {
        // First, do a simple check if we're in a browser environment
        if (typeof window.__TAURI__ === 'undefined') {
            console.log('Not running in Tauri environment (window.__TAURI__ check), using browser storage');
            this.useBrowserStorage = true;
            this.isRunningInTauri = false;
            return;
        }

        try {
            // Try to get the app version - this is a valid Tauri API call
            // that will fail if not running in Tauri environment
            const version = await getVersion();
            console.log('Tauri Version:', version);
            this.isRunningInTauri = true;
            this.useBrowserStorage = false;
        } catch (e) {
            console.log('Not running in Tauri environment, using browser storage');
            this.useBrowserStorage = true;
            this.isRunningInTauri = false;
        }
    }

    async savePrivateKey(publicKey: string, privateKey: string): Promise<boolean> {
        // If not running in Tauri or already set to use browser storage
        if (this.useBrowserStorage || !this.isRunningInTauri) {
            return false; // Indicate that secure storage wasn't used
        }
        
        try {
            const result: any = await invoke("save_private_key", { publicKey, privateKey });

            if (!result.success) {
                this.useBrowserStorage = true;
                console.error(result.message);
                return false;
            }

            return true; // Successfully saved in secure storage
        } catch (error) {
            console.error('Error saving private key:', error);
            this.useBrowserStorage = true;
            return false;
        }
    }

    async getPrivateKey(publicKey: string): Promise<string | null> {
        // If not running in Tauri or set to use browser storage
        if (this.useBrowserStorage || !this.isRunningInTauri) {
            return null; // Indicate that secure storage wasn't used
        }
        
        try {
            const result: any = await invoke("get_private_key", { publicKey });

            if (!result.success) {
                this.useBrowserStorage = true;
                console.error(result.message);
                return null;
            }

            return result.message;
        } catch (error) {
            console.error('Error getting private key:', error);
            this.useBrowserStorage = true;
            return null;
        }
    }
    
    async deletePrivateKey(publicKey: string): Promise<boolean> {
        if (this.useBrowserStorage || !this.isRunningInTauri) {
            return false;
        }
        
        try {
            const result: any = await invoke("delete_private_key", { publicKey });
            return result.success;
        } catch (error) {
            console.error('Error deleting private key:', error);
            return false;
        }
    }
}