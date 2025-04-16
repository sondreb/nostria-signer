import { Injectable, inject, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from "@tauri-apps/api/core";

interface KeyStorage {
  [key: string]: string;
}

@Injectable({
    providedIn: 'root'
})
export class TauriService {
    useBrowserStorage = signal<boolean>(true); // Default to browser storage for safety
    private isRunningInTauri = isTauri();
    private readonly STORAGE_KEY = 'nostria-signer-keys';
    
    constructor() {
        console.log('Nostria Signer in native mode:', this.isRunningInTauri);

        if (this.isRunningInTauri) {
            this.useBrowserStorage.set(false);
        }
    }

    async savePrivateKey(publicKey: string, privateKey: string): Promise<boolean> {
        // First attempt to use secure storage if in Tauri mode
        if (!this.useBrowserStorage() && this.isRunningInTauri) {
            try {
                console.log('Attempting to save key in secure storage');
                const result: any = await invoke("save_private_key", { publicKey, privateKey });

                if (result.success) {
                    console.log('Successfully saved key in secure storage');
                    return true;
                } else {
                    console.error('Secure storage failed:', result.message);
                    this.useBrowserStorage.set(true); // Fall back to browser storage
                    console.log('Falling back to browser storage');
                    // Continue to browser storage fallback
                }
            } catch (error) {
                console.error('Error saving private key in secure storage:', error);
                this.useBrowserStorage.set(true); // Fall back to browser storage
                console.log('Falling back to browser storage due to error');
                // Continue to browser storage fallback
            }
        }

        // Fallback to browser storage or direct browser storage use
        return this.saveToBrowserStorage(publicKey, privateKey);
    }

    async getPrivateKey(publicKey: string): Promise<string | null> {
        // First attempt to use secure storage if in Tauri mode
        if (!this.useBrowserStorage() && this.isRunningInTauri) {
            try {
                console.log('Attempting to get key from secure storage');
                const result: any = await invoke("get_private_key", { publicKey });

                if (result.success && result.private_key) {
                    console.log('Successfully retrieved key from secure storage');
                    return result.private_key;
                } else {
                    console.error('Secure storage retrieval failed:', result.message);
                    this.useBrowserStorage.set(true); // Fall back to browser storage
                    console.log('Falling back to browser storage for retrieval');
                    // Continue to browser storage fallback
                }
            } catch (error) {
                console.error('Error getting private key from secure storage:', error);
                this.useBrowserStorage.set(true); // Fall back to browser storage
                console.log('Falling back to browser storage due to error');
                // Continue to browser storage fallback
            }
        }

        // Fallback to browser storage or direct browser storage use
        return this.getFromBrowserStorage(publicKey);
    }

    async deletePrivateKey(publicKey: string): Promise<boolean> {
        let secureDeleteSuccess = false;
        
        // First attempt to delete from secure storage if in Tauri mode
        if (!this.useBrowserStorage() && this.isRunningInTauri) {
            try {
                console.log('Attempting to delete key from secure storage');
                const result: any = await invoke("delete_private_key", { publicKey });
                secureDeleteSuccess = result.success;
                
                if (result.success) {
                    console.log('Successfully deleted key from secure storage');
                }
            } catch (error) {
                console.error('Error deleting private key from secure storage:', error);
                this.useBrowserStorage.set(true);
            }
        }
        
        // Always try to delete from browser storage as well
        // This ensures we clean up browser storage even if we've been using secure storage
        const browserDeleteSuccess = this.deleteFromBrowserStorage(publicKey);
        
        // Return true if either deletion was successful
        return secureDeleteSuccess || browserDeleteSuccess;
    }
    
    // Private helper methods for browser storage
    private saveToBrowserStorage(publicKey: string, privateKey: string): boolean {
        try {
            let storage: KeyStorage = {};
            const existingData = localStorage.getItem(this.STORAGE_KEY);
            
            if (existingData) {
                storage = JSON.parse(existingData);
            }
            
            storage[publicKey] = privateKey;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storage));
            console.log('Successfully saved key in browser storage');
            return true;
        } catch (error) {
            console.error('Error saving to browser storage:', error);
            return false;
        }
    }
    
    private getFromBrowserStorage(publicKey: string): string | null {
        try {
            const existingData = localStorage.getItem(this.STORAGE_KEY);
            
            if (!existingData) {
                console.log('No keys found in browser storage');
                return null;
            }
            
            const storage: KeyStorage = JSON.parse(existingData);
            const privateKey = storage[publicKey];
            
            if (privateKey) {
                console.log('Successfully retrieved key from browser storage');
                return privateKey;
            } else {
                console.log('Key not found in browser storage');
                return null;
            }
        } catch (error) {
            console.error('Error reading from browser storage:', error);
            return null;
        }
    }
    
    private deleteFromBrowserStorage(publicKey: string): boolean {
        try {
            const existingData = localStorage.getItem(this.STORAGE_KEY);
            
            if (!existingData) {
                return false;
            }
            
            const storage: KeyStorage = JSON.parse(existingData);
            
            if (!(publicKey in storage)) {
                return false;
            }
            
            delete storage[publicKey];
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storage));
            console.log('Successfully deleted key from browser storage');
            return true;
        } catch (error) {
            console.error('Error deleting from browser storage:', error);
            return false;
        }
    }
}