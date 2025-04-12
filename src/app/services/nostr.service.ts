import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { v4 as uuidv4 } from 'uuid';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { kinds, nip19, SimplePool } from 'nostr-tools';
import { v2 } from 'nostr-tools/nip44';

// Constants for localStorage keys
export const STORAGE_KEYS = {
  SIGNER_KEYS: 'nostria-signer-keys',
  SIGNER_KEY: 'nostria-signer-key',
  SIGNER_CLIENTS: 'nostria-signer-clients',
  RELAYS: 'nostria-relays'
};

export interface NostrAccount {
  publicKey: string;
  privateKey: string;
  secret?: string;
}

export interface ClientActivation {
  clientPubkey: string;  // Public key of the nostr client connecting to the signer
  pubkey: string;        // Public key of the client identity
  activatedDate: string; // ISO date string when activation occurred
  secret: string;        // UUID used for activation
  permissions: string;   // Comma separated list of permissions
}

@Injectable({
  providedIn: 'root'
})
export class NostrService {
  private router = inject(Router);

  relays = ['wss://relay.angor.io/'];

  // Store the Nostr account information
  account = signal<NostrAccount | null>(null);

  // publicKey = '';

  keys = signal<NostrAccount[]>([]);
  
  // Signal to store client activations
  clientActivations = signal<ClientActivation[]>([]);

  // key = computed(() => {
  //   return this.keys().find((key: any) => key.publicKey === this.publicKey);
  // });

  pool: SimplePool | undefined;

  constructor() {
    // Load the signer key
    this.loadSignerKey();

    // Load saved relays if they exist
    this.loadRelays();
    
    // Load client activations
    this.loadClientActivations();

    const keysStorage = localStorage.getItem(STORAGE_KEYS.SIGNER_KEYS);

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

  // Load client activations from localStorage
  private loadClientActivations(): void {
    const activationsString = localStorage.getItem(STORAGE_KEYS.SIGNER_CLIENTS);
    if (activationsString) {
      try {
        const activations = JSON.parse(activationsString);
        this.clientActivations.set(activations);
      } catch (e) {
        console.error('Error parsing stored client activations:', e);
        this.clientActivations.set([]);
      }
    } else {
      this.clientActivations.set([]);
    }
  }

  // Save client activations to localStorage
  private saveClientActivations(): void {
    localStorage.setItem(STORAGE_KEYS.SIGNER_CLIENTS, JSON.stringify(this.clientActivations()));
  }

  // Add a new client activation
  addClientActivation(clientPubkey: string, pubkey: string, secret: string): void {
    const newActivation: ClientActivation = {
      clientPubkey,
      pubkey,
      activatedDate: new Date().toISOString(),
      secret,
      permissions: 'sign_event' // Default permission
    };
    
    this.clientActivations.update(activations => [...activations, newActivation]);
    this.saveClientActivations();
  }

  // Update client activation permissions
  updateActivationPermissions(clientPubkey: string, pubkey: string, secret: string, permissions: string): void {
    this.clientActivations.update(activations => 
      activations.map(activation => 
        (activation.clientPubkey === clientPubkey && 
         activation.pubkey === pubkey && 
         activation.secret === secret) 
          ? { ...activation, permissions } 
          : activation
      )
    );
    this.saveClientActivations();
  }

  // Delete a client activation
  deleteActivation(clientPubkey: string, pubkey: string, secret: string): void {
    this.clientActivations.update(activations => 
      activations.filter(activation => 
        !(activation.clientPubkey === clientPubkey && 
          activation.pubkey === pubkey && 
          activation.secret === secret)
      )
    );
    this.saveClientActivations();
  }

  // Get activations for a specific client identity
  getActivationsForIdentity(pubkey: string): ClientActivation[] {
    return this.clientActivations().filter(activation => activation.pubkey === pubkey);
  }

  // Load saved relays from local storage
  private loadRelays(): void {
    const savedRelays = localStorage.getItem(STORAGE_KEYS.RELAYS);
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
    localStorage.setItem(STORAGE_KEYS.RELAYS, JSON.stringify(this.relays));
  }

  connect() {
    // Close existing pool if it exists
    if (this.pool) {
      this.pool.close(this.relays);
    }

    this.pool = new SimplePool();

    console.log('Listening to relay with pub key:', this.account()!.publicKey);

    // Only subscribe if we have keys
    if (this.keys().length > 0) {
      this.pool.subscribeMany(this.relays, [
        {
          kinds: [kinds.NostrConnect],
          ['#p']: [this.account()!.publicKey],
        },
      ],
        {
          onevent: (evt) => {
            console.log('Event received', evt);

            debugger;

            const privateKeyHex = this.account()?.privateKey;
            const privateKey = hexToBytes(privateKeyHex!);

            // The content of evt is a NIP-44 encrypted event, decrypt it:
            const convKey = v2.utils.getConversationKey(privateKey, evt.pubkey);

            const decrypted = v2.decrypt(evt.content, convKey);
            console.log('Decrypted content:', decrypted);
            console.log(JSON.stringify(decrypted, null, 2));

            // {"id":"nv1jit-1","method":"connect","params":["911bd819a054536335761450e6fce916f2bae68b9cd1eeff0d6c2e4994e95034","9be97c6b-29dd-4d92-ae8d-8fa83ee4c72e"]}

            debugger;
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
    const signerKeyString = localStorage.getItem(STORAGE_KEYS.SIGNER_KEY);
    if (signerKeyString) {
      try {
        const signerKey = JSON.parse(signerKeyString);
        this.account.set(signerKey);
        // this.publicKey = signerKey.publicKey;
      } catch (e) {
        console.error('Error parsing stored signer key:', e);
        this.account.set(null);
      }
    }
  }

  // Save the signer key to local storage
  private saveSignerKey(account: NostrAccount): void {
    localStorage.setItem(STORAGE_KEYS.SIGNER_KEY, JSON.stringify(account));
    this.account.set(account);
    // this.publicKey = account.publicKey;
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
      const secret = uuidv4();

      let privateKeyClient = generateSecretKey();
      let publicKeyClient = getPublicKey(privateKeyClient);

      const keyPairClient: NostrAccount = {
        publicKey: publicKeyClient,
        privateKey: bytesToHex(privateKeyClient),
        secret
      };

      this.keys.update(array => [...array, keyPairClient]);
      localStorage.setItem(STORAGE_KEYS.SIGNER_KEYS, JSON.stringify(this.keys()));

      // When a new client identity is created, register a placeholder activation
      // The actual client pubkey will be updated when a real client connects
      this.addClientActivation('pending', publicKeyClient, secret);

      // Navigate to the setup page to display the connection URL
      this.router.navigate(['/setup']);
    } catch (error) {
      console.error('Error generating Nostr account:', error);
    }
  }

  async generateSignerAccount(): Promise<void> {
    try {
      let privateKey = generateSecretKey();
      let publicKey = getPublicKey(privateKey);
      const secret = uuidv4();

      const keyPair: NostrAccount = {
        publicKey,
        privateKey: bytesToHex(privateKey)
      };

      // Save as signer key
      this.saveSignerKey(keyPair);

      let privateKeyClient = generateSecretKey();
      let publicKeyClient = getPublicKey(privateKeyClient);

      const keyPairClient: NostrAccount = {
        publicKey: publicKeyClient,
        privateKey: bytesToHex(privateKeyClient),
        secret
      };

      this.keys.update(array => [...array, keyPairClient]);
      localStorage.setItem(STORAGE_KEYS.SIGNER_KEYS, JSON.stringify(this.keys()));

      // When a new client identity is created, register a placeholder activation
      // The actual client pubkey will be updated when a real client connects
      this.addClientActivation('pending', publicKeyClient, secret);

      // Navigate to the setup page to display the connection URL
      this.router.navigate(['/setup']);
    } catch (error) {
      console.error('Error generating Nostr account:', error);
    }
  }

  // Import an existing Nostr private key (nsec)
  async importAccount(nsecKey: string): Promise<boolean> {
    try {
      let privateKeyBytes: Uint8Array;

      if (nsecKey.startsWith('nsec')) {
        try {
          const decoded = nip19.decode(nsecKey);
          privateKeyBytes = decoded.data as Uint8Array;
        } catch (e) {
          console.error('Invalid nsec format:', e);
          return false;
        }
      } else {
        try {
          privateKeyBytes = hexToBytes(nsecKey);
          await this.generateAccount();
        } catch (e) {
          console.error('Invalid hex format:', e);
          return false;
        }
      }

      const publicKey = getPublicKey(privateKeyBytes);

      const keyPair: NostrAccount = {
        publicKey,
        privateKey: bytesToHex(privateKeyBytes)
      };

      this.saveSignerKey(keyPair);
      await this.generateAccount();

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
    this.clientActivations.set([]);
    localStorage.removeItem(STORAGE_KEYS.SIGNER_KEYS);
    localStorage.removeItem(STORAGE_KEYS.SIGNER_KEY);
    localStorage.removeItem(STORAGE_KEYS.SIGNER_CLIENTS);
    localStorage.removeItem(STORAGE_KEYS.RELAYS);
    this.router.navigate(['/']);
  }

  // Delete a specific key by publicKey
  deleteKey(publicKey: string): void {
    this.keys.update(keys => keys.filter(key => key.publicKey !== publicKey));
    localStorage.setItem(STORAGE_KEYS.SIGNER_KEYS, JSON.stringify(this.keys()));

    // Also delete all activations for this key
    this.clientActivations.update(activations => 
      activations.filter(activation => activation.pubkey !== publicKey)
    );
    this.saveClientActivations();

    // If we're deleting the signer key, reset it
    if (this.account()?.publicKey === publicKey) {
      this.account.set(null);
      localStorage.removeItem(STORAGE_KEYS.SIGNER_KEY);
    }
  }
}
