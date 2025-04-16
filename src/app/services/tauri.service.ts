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
        }

        return result.message;
    }

    async getPrivateKey(publicKey: string): Promise<string> {
        const result: any = await invoke("get_private_key", { publicKey });

        if (!result.success) {
            this.useBrowserStorage = true;
        }

        return result.message;
    }
}

invoke<string>("save_private_key", { publicKey: publicKeyHex, privateKey: privateKeyHex }).then((result: any) => {
    if (!result.success) {
        alert('Failed to use secure key storage:' + result.message);
    }

    alert(result);
    console.log(result);
});

// invoke<string>("get_private_key", { publicKey: publicKeyHex }).then((text) => {
//   alert(text);
// });