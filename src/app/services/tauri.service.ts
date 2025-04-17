import { Injectable, inject, signal, effect, assertInInjectionContext, EffectRef } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from "@tauri-apps/api/core";
import { platform, version } from '@tauri-apps/plugin-os';

interface KeyStorage {
    [key: string]: string;
}

@Injectable({
    providedIn: 'root'
})
export class TauriService {
    useBrowserStorage = signal<boolean>(true); // Default to browser storage for safety
    initialized = signal<boolean>(false); // Track initialization status
    private isRunningInTauri = isTauri();
    isAndroid = signal<boolean>(false);
    private readonly STORAGE_KEY = 'nostria-signer-keys';

    constructor() {
        this.initializePlatform();
    }

    async ping() {
        const result: any = await invoke("ping");
        return result;
    }

    private async initializePlatform() {
        if (this.isRunningInTauri) {

            console.log('Platform:', platform());
            console.log('Version:', version());
        }
        console.log('Nostria Signer in native mode:', this.isRunningInTauri);

        if (this.isRunningInTauri) {
            try {
                // Check if we're running on Android using Tauri v2 API
                const osType = platform();
                this.isAndroid.set(osType.toLowerCase() === 'android');

                // Android doesn't support secure keyring storage, so use browser storage
                if (this.isAndroid()) {
                    console.log('Running on Android, using browser storage');
                    this.useBrowserStorage.set(true);
                } else {
                    console.log('Running on desktop, using secure storage');
                    this.useBrowserStorage.set(false);
                }
            } catch (error) {
                console.error('Error detecting platform:', error);
                this.useBrowserStorage.set(true); // Fallback to browser storage on error
            }
        }

        // Mark initialization as complete
        this.initialized.set(true);
        console.log('TauriService initialization complete');
    }

    /**
     * Creates an effect that runs the provided callback when this service is initialized.
     * @param callback The function to run when initialized
     * @returns An EffectRef that can be used to destroy the effect
     */
    onInitialized(callback: () => void): EffectRef {
        // Assert we're in an injection context (component, directive, pipe, or service)
        assertInInjectionContext(this.onInitialized);

        // Create an effect that watches the initialized signal
        return effect(() => {
            if (this.initialized()) {
                callback();
            }
        });
    }

    async savePrivateKey(publicKey: string, privateKey: string) {
        // Use secure storage only if in Tauri mode AND not on Android
        if (!this.useBrowserStorage()) {
            try {
                console.log('Attempting to save key in secure storage');
                const result: any = await invoke("save_private_key", { publicKey, privateKey });

                if (result.success) {
                    console.log('Successfully saved key in secure storage');
                } else {
                    console.error('Secure storage failed:', result.message);
                    this.useBrowserStorage.set(true);
                    console.log('Falling back to browser storage');
                    // Continue to browser storage fallback
                }
            } catch (error) {
                console.error('Error saving private key in secure storage:', error);
                this.useBrowserStorage.set(true);
                console.log('Falling back to browser storage due to error');
                // Continue to browser storage fallback
            }
        }

        if (this.useBrowserStorage()) {
            this.saveToBrowserStorage(publicKey, privateKey);
        }
    }

    async getPrivateKey(publicKey: string) {
        // Use secure storage only if in Tauri mode AND not on Android
        if (!this.useBrowserStorage()) {
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

        if (this.useBrowserStorage()) {
            // Fallback to browser storage or direct browser storage use
            return this.getFromBrowserStorage(publicKey);
        }
    }

    async deletePrivateKey(publicKey: string) {
        // Use secure storage only if in Tauri mode AND not on Android
        if (!this.useBrowserStorage()) {
            try {
                console.log('Attempting to delete key from secure storage');
                const result: any = await invoke("delete_private_key", { publicKey });

                if (result.success) {
                    console.log('Successfully deleted key from secure storage');
                }
            } catch (error) {
                console.error('Error deleting private key from secure storage:', error);
                this.useBrowserStorage.set(true);
            }
        }

        if (this.useBrowserStorage()) {
            // Always try to delete from browser storage as well
            // This ensures we clean up browser storage even if we've been using secure storage
            this.deleteFromBrowserStorage(publicKey);
        }
    }

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