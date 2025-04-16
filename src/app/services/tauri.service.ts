import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

@Injectable({
    providedIn: 'root'
})
export class TauriService {
    useBrowserStorage = false;

    async savePrivateKey(publicKey: string, privateKey: string): Promise<void> {
        const result: any = await invoke("save_private_key", { publicKey, privateKey });

        if (!result.success) {
            this.useBrowserStorage = true;
            console.error(result.message);
        }

        return result.message;
    }

    async getPrivateKey(publicKey: string): Promise<string> {
        const result: any = await invoke("get_private_key", { publicKey });

        if (!result.success) {
            this.useBrowserStorage = true;
            console.error(result.message);
        }

        return result.message;
    }
}