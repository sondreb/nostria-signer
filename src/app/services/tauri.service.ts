import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from "@tauri-apps/api/core";

@Injectable({
    providedIn: 'root'
})
export class TauriService {
    useBrowserStorage = true; // Default to browser storage for safety
    private isRunningInTauri = isTauri();

    constructor() {
        console.log('IS TUARI:', this.isRunningInTauri);

        if (this.isRunningInTauri) {
            this.useBrowserStorage = false;
        }
    }

    async savePrivateKey(publicKey: string, privateKey: string): Promise<boolean> {
        debugger;
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