import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { v4 as uuidv4 } from 'uuid';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { kinds, nip19, SimplePool } from 'nostr-tools';
import { v2 } from 'nostr-tools/nip44';

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

  pool: SimplePool | undefined;

  constructor() {
    // Load the signer key
    this.loadSignerKey();
    
    // Load saved relays if they exist
    this.loadRelays();

    const keysStorage = localStorage.getItem('nostria-signer-keys');

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

    this.connect();
  }

  // Load saved relays from local storage
  private loadRelays(): void {
    const savedRelays = localStorage.getItem('nostria-relays');
    if (savedRelays) {
      try {
        const relaysArray = JSON.parse(savedRelays);
        if (Array.isArray(relaysArray) && relaysArray.length > 0) {
          this.relays = relaysArray;
        }
      } catch (e) {
        console.error('Error parsing stored relays:', e);
      }
    }
  }

  // Save relays to local storage
  private saveRelays(): void {
    localStorage.setItem('nostria-relays', JSON.stringify(this.relays));
  }

  connect() {
    // Close existing pool if it exists
    if (this.pool) {
      this.pool.close(this.relays);
    }
    
    this.pool = new SimplePool();

    // Only subscribe if we have keys
    if (this.keys().length > 0) {
      this.pool.subscribeMany(this.relays, [
        {
          kinds: [kinds.NostrConnect],
          ['#p']: ['23cba1afe0a23313007114d36d62cc52bf938483fe459a44868ac06856cf247e'],
        },
      ],
        {
          onevent: (evt) => {
            console.log('Event received', evt);

            const privateKeyHex = this.keys()[0].privateKey;
            const privateKey = hexToBytes(privateKeyHex);

            // The content of evt is a NIP-44 encrypted event, decrypt it:
            const convKey = v2.utils.getConversationKey(privateKey, evt.pubkey);

            const decrypted = v2.decrypt(evt.content, convKey);
            console.log('Decrypted content:', decrypted);
            console.log(JSON.stringify(decrypted, null, 2));
          },

          onclose: (reasons) => {
            console.log('Pool closed', reasons);
          },
        }
      );
    }

    console.log('Connected to relays:', this.relays);
  }

  // Update relays list and reconnect
  updateRelays(newRelays: string[]): void {
    // Ensure we always have at least one relay
    if (newRelays.length === 0) {
      newRelays = ['wss://relay.angor.io/'];
    }
    
    this.relays = [...newRelays];
    this.saveRelays();
    this.connect();
  }

  // Load the signer key from local storage
  private loadSignerKey(): void {
    const signerKeyString = localStorage.getItem('nostria-signer-key');
    if (signerKeyString) {
      try {
        const signerKey = JSON.parse(signerKeyString);
        this.account.set(signerKey);
        this.publicKey = signerKey.publicKey;
      } catch (e) {
        console.error('Error parsing stored signer key:', e);
        this.account.set(null);
      }
    }
  }

  // Save the signer key to local storage
  private saveSignerKey(account: NostrAccount): void {
    localStorage.setItem('nostria-signer-key', JSON.stringify(account));
    this.account.set(account);
    this.publicKey = account.publicKey;
  }

  // Generate connection URL for a given account
  getConnectionUrl(account: NostrAccount): string {
    // Get the active signer account's public key (this is used as the remote signer)
    const signerPublicKey = this.account()?.publicKey || account.publicKey;

    // Format each relay with "relay=" prefix and join with &
    const relaysParam = this.relays.map(relay => `relay=${relay}`).join('&');

    return `bunker://${signerPublicKey}?${relaysParam}&secret=${account.secret}`;
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

      // Save as signer key
      this.saveSignerKey(keyPair);

      this.keys.update(array => [...array, keyPair]);
      localStorage.setItem('nostria-signer-keys', JSON.stringify(this.keys()));

      // Navigate to the setup page to display the connection URL
      this.router.navigate(['/setup']);
    } catch (error) {
      console.error('Error generating Nostr account:', error);
    }
  }

  // Import an existing Nostr private key (nsec)
  async importAccount(nsecKey: string): Promise<boolean> {
    try {
      // Handle hex or bech32 format
      let privateKeyBytes: Uint8Array;

      // Example nsec: nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5
      // Example hex: 67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa

      debugger;

      if (nsecKey.startsWith('nsec')) {
        // This is simplified - in a real app you'd use proper bech32 decoding
        // You may need to add proper bech32 library to handle this correctly
        try {
          const decoded = nip19.decode(nsecKey);
          console.log('Decoded nsec:', decoded);

          debugger;
          // const { data } = parseBunkerInput(nsecKey);
          privateKeyBytes = decoded.data as Uint8Array;
          console.log('Private key bytes:', bytesToHex(privateKeyBytes));
        } catch (e) {
          console.error('Invalid nsec format:', e);
          return false;
        }
      } else {
        // Assume it's hex format
        try {
          privateKeyBytes = hexToBytes(nsecKey);
        } catch (e) {
          console.error('Invalid hex format:', e);
          return false;
        }
      }

      // Derive public key from private key
      const publicKey = getPublicKey(privateKeyBytes);
      const secret = uuidv4();

      const keyPair: NostrAccount = {
        publicKey,
        privateKey: bytesToHex(privateKeyBytes),
        secret
      };

      // Save as signer key
      this.saveSignerKey(keyPair);

      // Add to keys collection
      this.keys.update(array => [...array, keyPair]);
      localStorage.setItem('nostria-signer-keys', JSON.stringify(this.keys()));

      // Navigate to the setup page
      this.router.navigate(['/setup']);
      return true;
    } catch (error) {
      console.error('Error importing Nostr account:', error);
      return false;
    }
  }

  // Reset all accounts
  reset(): void {
    this.keys.set([]);
    this.account.set(null);
    localStorage.removeItem('nostria-signer-keys');
    localStorage.removeItem('nostria-signer-key');
    localStorage.removeItem('nostria-relays');
    this.router.navigate(['/']);
  }

  // Delete a specific key by publicKey
  deleteKey(publicKey: string): void {
    this.keys.update(keys => keys.filter(key => key.publicKey !== publicKey));
    localStorage.setItem('nostria-signer-keys', JSON.stringify(this.keys()));

    // If we're deleting the signer key, reset it
    if (this.account()?.publicKey === publicKey) {
      this.account.set(null);
      localStorage.removeItem('nostria-signer-key');
    }
  }
}
