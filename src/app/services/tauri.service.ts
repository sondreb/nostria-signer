import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

@Injectable({
    providedIn: 'root'
})
export class TauriService {
    savePrivateKey(publicKey: string, privateKey: string): Promise<void> {
        return invoke("save_private_key", { publicKey, privateKey });
    }
    getPrivateKey(publicKey: string): Promise<string> {
        return invoke("get_private_key", { publicKey });
    }
}