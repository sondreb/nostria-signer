import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

@Injectable({
    providedIn: 'root'
})
export class TauriService {
    useBrowserStorage = false;
    private isRunningInTauri = false;
    
    constructor() {
        // Check if running in Tauri environment
        this.checkTauriEnvironment();
    }
    
    private async checkTauriEnvironment(): Promise<void> {
        try {
            // Try to invoke a simple Tauri command
            await invoke('plugin:app|platform');
            this.isRunningInTauri = true;
        } catch (e) {
            console.log('Not running in Tauri environment, using browser storage');
            this.useBrowserStorage = true;
        }
    }

    async savePrivateKey(publicKey: string, privateKey: string): Promise<boolean> {
        // If not running in Tauri or already set to use browser storage
        if (this.useBrowserStorage) {
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
        if (this.useBrowserStorage) {
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
        if (this.useBrowserStorage) {
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