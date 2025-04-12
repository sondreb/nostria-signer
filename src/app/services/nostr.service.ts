import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { v4 as uuidv4 } from 'uuid';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';


export interface NostrAccount {
  publicKey: string;
  privateKey: string;
  secret: string;
}

@Injectable({
  providedIn: 'root'
})
export class NostrService {
  private router = inject(Router);

  relays = ['wss://relay.angor.io/'];

  // Store the Nostr account information
  account = signal<NostrAccount | null>(null);

  publicKey = '';

  keys = signal<NostrAccount[]>([]);

  key = computed(() => {
    return this.keys().find((key: any) => key.publicKey === this.publicKey);
  });

  constructor() {
    const keysStorage = localStorage.getItem('nostr-signer-keys');

    if (keysStorage) {
      try {
        const storedKeys = JSON.parse(keysStorage);
        // Only keep the required properties for each key
        const validKeys = storedKeys.map((key: any) => ({
          publicKey: key.publicKey,
          privateKey: key.privateKey,
          secret: key.secret
        }));
        this.keys.set(validKeys);
      } catch (e) {
        console.error('Error parsing stored keys:', e);
        this.keys.set([]);
      }
    } else {
      this.keys.set([]);
    }
  }

  // Generate connection URL for a given account
  getConnectionUrl(account: NostrAccount): string {
    // const metadata = JSON.stringify({
    //   name: "Nostria Signer",
    //   url: "https://nostria.brainbox.no"
    // });
    
    // Format each relay with "relay=" prefix and join with &
    const relaysParam = this.relays.map(relay => `relay=${relay}`).join('&');
    
    return `bunker://${account.publicKey}?${relaysParam}&secret=${account.secret}`;
    // return `bunker://${account.publicKey}?${relaysParam}&secret=${account.secret}&metadata=${encodeURIComponent(metadata)}`;
  }

  // Generate a new Nostr account
  async generateAccount(): Promise<void> {
    try {
      let privateKey = generateSecretKey();
      let publicKey = getPublicKey(privateKey);
      const secret = uuidv4();
      
      const keyPair: NostrAccount = { 
        publicKey, 
        privateKey: bytesToHex(privateKey), 
        secret
      };
      
      this.keys.update(array => [...array, keyPair]);
      localStorage.setItem('nostr-signer-keys', JSON.stringify(this.keys()));
      this.publicKey = publicKey;

      // Navigate to the setup page to display the connection URL
      this.router.navigate(['/setup']);
    } catch (error) {
      console.error('Error generating Nostr account:', error);
    }
  }

  // Reset all accounts
  reset(): void {
    this.keys.set([]);
    localStorage.removeItem('nostr-signer-keys');
    this.router.navigate(['/']);
  }
  
  // Delete a specific key by publicKey
  deleteKey(publicKey: string): void {
    this.keys.update(keys => keys.filter(key => key.publicKey !== publicKey));
    localStorage.setItem('nostr-signer-keys', JSON.stringify(this.keys()));
  }
}
