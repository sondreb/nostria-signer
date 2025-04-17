import { Injectable, computed, inject, signal, effect } from '@angular/core';
import { Router } from '@angular/router';
import { Event, EventTemplate, finalizeEvent, generateSecretKey, getPublicKey, UnsignedEvent } from 'nostr-tools/pure';
import { v4 as uuidv4 } from 'uuid';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { kinds, nip19, SimplePool } from 'nostr-tools';
import { v2 } from 'nostr-tools/nip44';
import { LogService, LogType } from './log.service';
import { decrypt, encrypt } from 'nostr-tools/nip04';
import { TauriService } from './tauri.service';

// Constants for localStorage keys
export const STORAGE_KEYS = {
  SIGNER_KEYS: 'nostria-signer-keys',
  SIGNER_KEY: 'nostria-signer-key',
  SIGNER_CLIENTS: 'nostria-signer-clients',
  RELAYS: 'nostria-signer-relays',
  SIGNER_LOGS: 'nostria-signer-logs',
  SIGNER_THEME: 'nostria-signer-theme',
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
  secret?: string;       // UUID used for activation, removed after activation
  permissions: string;   // Comma separated list of permissions
  clientId?: string;     // ID of the client connection
  nip4?: boolean;         // Indicates if NIP-4 or NIP-44 is used.
}

@Injectable({
  providedIn: 'root'
})
export class NostrService {
  private router = inject(Router);
  private tauriService = inject(TauriService);

  relays = ['wss://relay.angor.io/'];

  // Track connection status
  connectionStatus = signal<'connected' | 'disconnected' | 'connecting'>('disconnected');

  // Store last connection attempt timestamp
  private lastConnectionAttempt = signal<number>(0);

  // Track relay connection health check interval
  private connectionCheckInterval: any = null;

  // Store the Nostr account information
  account = signal<NostrAccount | null>(null);

  keys = signal<NostrAccount[]>([]);

  // Signal to store client activations
  clientActivations = signal<ClientActivation[]>([]);

  pool: SimplePool | undefined;

  private accountExists = signal<boolean>(false);

  // New signal to track service initialization
  serviceInitialized = signal<boolean>(false);

  constructor(
    private logService: LogService
  ) {
    effect(async () => {
      if (this.tauriService.initialized()) {
        // Initialize the app
        await this.initialize();
      }
    });

    // Setup visibility change event listener
    this.setupVisibilityChangeListener();
  }

  // Initialize the app asynchronously
  private async initialize(): Promise<void> {
    // Load the signer key
    await this.loadSignerKey();

    // Load saved relays if they exist
    this.loadRelays();

    // Load client activations
    this.loadClientActivations();

    // Load client keys
    await this.loadClientKeys();

    this.connect();

    // Start connection monitoring
    this.startConnectionMonitoring();

    // Mark this service as initialized
    this.serviceInitialized.set(true);
    console.log('NostrService initialization complete');

    // setInterval(async () => {
    //   const result = await this.tauriService.ping();
    //   console.log('Got pong:', result);
    //   console.log('Pinged Tauri service. Verifying connection...');
    //   this.connect();
    // }, 2000);
  }

  hasAccount(): boolean {
    return this.accountExists();
  }

  async checkExistingAccount(): Promise<boolean> {
    try {
      // Implementation will depend on how you store the account
      // Example using localStorage:
      const storedKey = localStorage.getItem(STORAGE_KEYS.SIGNER_KEY);
      const hasAccount = !!storedKey;
      this.accountExists.set(hasAccount);
      return hasAccount;
    } catch (error) {
      console.error('Error checking for existing account:', error);
      this.accountExists.set(false);
      return false;
    }
  }

  // Setup visibility change listener
  private setupVisibilityChangeListener(): void {
    // If we're in a browser environment
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          console.log('App became visible, checking connection status');
          this.checkAndReconnectIfNeeded();
        }
      });

      // For mobile apps, we can also listen for resume events
      window.addEventListener('focus', () => {
        console.log('Window got focus, checking connection status');
        this.checkAndReconnectIfNeeded();
      });
    }
  }

  // Start monitoring the connection
  private startConnectionMonitoring(): void {
    // Clear any existing interval
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    // Check connection every 30 seconds
    this.connectionCheckInterval = setInterval(() => {
      this.checkAndReconnectIfNeeded();
    }, 10000); // 10 seconds
  }

  // Check connection status and reconnect if needed
  private checkAndReconnectIfNeeded(): void {
    console.log('Checking connection...');
    // Only try to reconnect if we're not already connecting and have an account
    if (this.connectionStatus() !== 'connecting' && this.account()) {
      // Check if we have pool and if it's connected
      if (!this.pool || !this.isConnected()) {
        console.log('Connection appears to be down, attempting to reconnect...');
        this.logService.addEntry(
          LogType.CONNECTION,
          'Connection appears to be down, attempting to reconnect'
        );

        // Only reconnect if it's been at least 5 seconds since last attempt
        // This prevents reconnection storms
        const now = Date.now();
        if (now - this.lastConnectionAttempt() > 5000) {
          this.lastConnectionAttempt.set(now);
          this.connect();
        }
      }
    }
  }

  // Check if the pool is currently connected
  private isConnected(): boolean {
    // If no pool exists, we're definitely not connected
    if (!this.pool) return false;

    // In a real implementation, you might want to add more sophisticated checks
    // like recent event timestamps or a ping-pong mechanism
    return this.connectionStatus() === 'connected';
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

  // Get default permissions in the correct format
  getDefaultPermissions(): string {
    const permissions = [
      "get_public_key",
      "nip04_encrypt",
      "nip04_decrypt",
      "nip44_encrypt",
      "nip44_decrypt",
      "decrypt_zap_event",
      "sign_event:0",
      "sign_event:1",
      "sign_event:3",
      "sign_event:4",
      "sign_event:5",
      "sign_event:6",
      "sign_event:7",
      "sign_event:9734",
      "sign_event:9735",
      "sign_event:10000",
      "sign_event:10002",
      "sign_event:10003",
      "sign_event:10013",
      "sign_event:31234",
      "sign_event:30078",
      "sign_event:22242",
      "sign_event:27235",
      "sign_event:30023"
    ];

    return permissions.join(',');
  }

  // Format permissions for display
  formatPermissionsForDisplay(permissionsString: string): string {
    return permissionsString;
  }

  // Add a new client activation
  addClientActivation(clientPubkey: string, pubkey: string, secret: string): void {
    const newActivation: ClientActivation = {
      clientPubkey,
      pubkey,
      activatedDate: new Date().toISOString(),
      secret,
      permissions: this.getDefaultPermissions() // Set default permissions
    };

    this.clientActivations.update(activations => [...activations, newActivation]);
    this.saveClientActivations();
  }

  // Generate a new activation for an existing key
  generateNewActivation(publicKey: string): void {
    const secret = uuidv4();
    this.addClientActivation('pending', publicKey, secret);
  }

  // Update client activation when connection is established
  updateClientActivationOnConnect(activationIndex: number, clientPubkey: string, clientId: string, nip4: boolean) {
    this.clientActivations.update(activations => {
      const updated = [...activations];
      updated[activationIndex] = {
        ...updated[activationIndex],
        clientPubkey,     // Set the real client pubkey
        clientId,         // Save the client ID
        secret: undefined, // Remove the secret as it's been used
        nip4: nip4
      };
      return updated;
    });
    this.saveClientActivations();

    return this.clientActivations()[activationIndex];
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
    if (this.connectionStatus() === 'connected') {
      return;
    }

    // Set connecting state
    this.connectionStatus.set('connecting');

    // Close existing pool if it exists
    if (this.pool) {
      console.log('POOL CLOSE IN CONNECT!');
      this.pool.close(this.relays);
    }

    if (!this.account()) {
      this.connectionStatus.set('disconnected');
      return;
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
            // If we get an event, we're connected
            this.connectionStatus.set('connected');
            this.processEvent(evt);
          },

          onclose: (reasons) => {
            console.log('Pool closed', reasons);
            this.connectionStatus.set('disconnected');

            // Attempt to reconnect after a short delay
            setTimeout(() => {
              this.checkAndReconnectIfNeeded();
            }, 5000);
          },
        }
      );

      // Set connected state - we'll assume it worked for now
      this.connectionStatus.set('connected');
    } else {
      this.connectionStatus.set('disconnected');
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

  processEvent(evt: Event) {
    const privateKeyHex = this.account()?.privateKey;
    const privateKey = hexToBytes(privateKeyHex!);

    try {
      let decrypted = undefined;
      let nip4 = false;

      if (evt.content.indexOf('iv=') === -1) {
        // The content of evt is a NIP-44 encrypted event, decrypt it:
        const convKey = v2.utils.getConversationKey(privateKey, evt.pubkey);
        decrypted = v2.decrypt(evt.content, convKey);
        console.log('Decrypted content:', decrypted);
      } else {
        decrypted = decrypt(privateKey, evt.pubkey, evt.content);
        nip4 = true;
      }

      // Log the received event
      this.logService.addEntry(
        LogType.EVENT_RECEIVED,
        `Received event type: ${evt.kind}`,
        evt,
        evt.pubkey
      );

      // Parse the decrypted content
      const requestData = JSON.parse(decrypted);
      console.log('Request:', JSON.stringify(requestData, null, 2));

      // Check if we have a valid method and params
      if (!requestData.method || !requestData.id) {
        console.error('Invalid request format');
        return;
      }

      // Look for matching client activation
      let clientActivation = this.clientActivations().find(
        activation => activation.clientPubkey === evt.pubkey
      );

      if (!clientActivation && requestData.method !== 'connect') {
        console.error('Unauthorized client request:', evt.pubkey);
        return;
      }

      // Process different method types
      switch (requestData.method) {
        case 'connect': {
          if (requestData.params?.length > 1) {
            // Check if the client is already activated
            const [signerPubkey, secret] = requestData.params;

            // Some clients will send perms, example:
            // "params": [
            //   "5a149ffc729683947f4b0e6fef437874a51b365c81a3e717117c3d306a11505f",
            //   "cb0d1290-bd26-4e37-bd06-6623eb9445ac",
            //   "sign_event:22242,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt"
            // ]

            if (signerPubkey !== this.account()?.publicKey) {
              console.error('Signer public key mismatch:', signerPubkey);
              // this.sendResponse(evt.pubkey, requestData.id, null, {code: 401, message: "Unauthorized"});
              return;
            }

            // Find activation with matching secret
            const activationIndex = this.clientActivations().findIndex(
              activation => activation.secret === secret
            );

            if (activationIndex >= 0) {
              // Update the activation with client pubkey and ID
              clientActivation = this.updateClientActivationOnConnect(
                activationIndex,
                evt.pubkey,
                requestData.id,
                nip4
              );

              // Send response back to client
              this.sendResponse(clientActivation!, evt.pubkey, requestData.id, "ack");
              console.log('Client connection activated successfully');

              // Log the new connection
              this.logService.addEntry(
                LogType.CONNECTION,
                `New client connected`,
                { clientPubkey: evt.pubkey, pubkey: signerPubkey },
                signerPubkey
              );
            } else {
              console.warn('No matching activation found for secret:', secret);
              this.sendResponse(clientActivation!, evt.pubkey, requestData.id, null, { code: 401, message: "Unauthorized" });
            }
          }
          break;
        }

        case 'get_public_key': {
          // Check if client has permission
          if (!this.hasPermission(clientActivation, 'get_public_key')) {
            this.sendResponse(clientActivation!, evt.pubkey, requestData.id, null, { code: 403, message: "Permission denied" });
            break;
          }

          // Get public key for the requested client identity
          const publicKey = clientActivation!.pubkey;
          this.sendResponse(clientActivation!, evt.pubkey, requestData.id, publicKey);
          break;
        }

        case 'ping': {
          // Simple ping-pong response
          this.sendResponse(clientActivation!, evt.pubkey, requestData.id, "pong");
          break;
        }

        case 'sign_event': {
          if (!requestData.params || requestData.params.length < 1) {
            this.sendResponse(clientActivation!, evt.pubkey, requestData.id, null, { code: 400, message: "Invalid parameters" });
            break;
          }

          const eventToSign = JSON.parse(requestData.params[0]);

          // Check if client has permission for this event kind
          if (!this.hasPermission(clientActivation, `sign_event:${eventToSign.kind}`)) {
            this.sendResponse(clientActivation!, evt.pubkey, requestData.id, null, { code: 403, message: "Permission denied for this event kind" });
            break;
          }

          // Log the signing request
          this.logService.addEntry(
            LogType.SIGN_REQUEST,
            `Signing request for event kind: ${eventToSign.kind}`,
            eventToSign,
            evt.pubkey
          );

          const clientKeyPair = this.getClientKey(clientActivation!.pubkey)!;
          const clientPrivateKey = clientKeyPair.privateKey;

          // Some Nostr clients put pubkey in the event data, this must be removed:
          delete eventToSign.pubkey;

          const verifiedEvent = finalizeEvent(eventToSign, hexToBytes(clientPrivateKey!));

          console.log('Request to sign event:', eventToSign);
          this.sendResponse(clientActivation!, evt.pubkey, requestData.id, JSON.stringify(verifiedEvent), null);
          break;
        }

        case 'nip04_encrypt':
        case 'nip04_decrypt': {
          if (!this.hasPermission(clientActivation, requestData.method)) {
            this.sendResponse(clientActivation!, evt.pubkey, requestData.id, null, { code: 403, message: "Permission denied" });
            break;
          }

          // Log the encryption/decryption request
          this.logService.addEntry(
            LogType.ENCRYPTION,
            `Request for ${requestData.method}`,
            requestData.params,
            evt.pubkey
          );

          let result: string | undefined = undefined;

          console.log(`Request for ${requestData.method}:`, requestData.params);

          const clientKeyPair = this.getClientKey(clientActivation!.pubkey)!;
          const clientPrivateKey = clientKeyPair.privateKey;

          if (requestData.method === 'nip04_encrypt') {
            const [pubkey, plaintext] = requestData.params;

            const cipher = encrypt(clientPrivateKey, pubkey, plaintext);
            result = cipher;
          } else if (requestData.method === 'nip04_decrypt') {
            const [pubkey, cipher] = requestData.params;

            const plaintext = decrypt(clientKeyPair.privateKey, pubkey, cipher);
            result = plaintext;
          }

          this.sendResponse(clientActivation!, evt.pubkey, requestData.id, result);
          break;
        }

        case 'nip44_encrypt':
        case 'nip44_decrypt': {
          if (!this.hasPermission(clientActivation, requestData.method)) {
            this.sendResponse(clientActivation!, evt.pubkey, requestData.id, null, { code: 403, message: "Permission denied" });
            break;
          }

          // Log the encryption/decryption request
          this.logService.addEntry(
            LogType.ENCRYPTION,
            `Request for ${requestData.method}`,
            requestData.params,
            evt.pubkey
          );

          let result: string | undefined = undefined;
          const clientKeyPair = this.getClientKey(clientActivation!.pubkey)!;
          const clientPrivateKey = clientKeyPair.privateKey;

          if (requestData.method === 'nip44_encrypt') {
            const [pubkey, plaintext] = requestData.params;

            const convKey = v2.utils.getConversationKey(privateKey, pubkey);
            const cipher = v2.encrypt(plaintext, convKey);
            result = cipher;
          } else if (requestData.method === 'nip44_decrypt') {
            const [pubkey, cipher] = requestData.params;

            const convKey = v2.utils.getConversationKey(privateKey, pubkey);
            const plaintext = v2.decrypt(cipher, convKey);
            result = plaintext;
          }

          console.log(`Request for ${requestData.method}:`, requestData.params);
          this.sendResponse(clientActivation!, evt.pubkey, requestData.id, result);
          break;
        }

        default:
          console.warn('Unhandled method:', requestData.method);
          this.sendResponse(clientActivation!, evt.pubkey, requestData.id, null, { code: 400, message: "Unsupported method" });
          break;
      }
    } catch (error) {
      console.error('Error processing event:', error);
    }
  }

  // Helper method to send responses back to clients
  private sendResponse(
    clientActivation: ClientActivation,
    pubkey: string,
    id: string,
    result: any = null,
    error: { code: number, message: string } | null = null
  ): void {
    if (!this.pool) {
      console.error('Cannot send response: pool not initialized');
      return;
    }

    const response = {
      id,
      result,
      error
    };

    try {
      const privateKeyHex = this.account()?.privateKey;
      const privateKey = hexToBytes(privateKeyHex!);
      let encryptedContent = undefined;

      if (clientActivation.nip4) {
        encryptedContent = encrypt(privateKey, pubkey, JSON.stringify(response));
      } else {
        const convKey = v2.utils.getConversationKey(privateKey, pubkey);
        encryptedContent = v2.encrypt(JSON.stringify(response), convKey);
      }

      const responseEvent: UnsignedEvent = {
        kind: kinds.NostrConnect,
        pubkey: this.account()!.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', pubkey]],
        content: encryptedContent
      };

      const verifiedEvent = finalizeEvent(responseEvent, privateKey);

      // TODO: Properly sign the event
      // For now just indicating where signing would happen
      console.log('Sending response:', responseEvent);

      // Publish to relays
      this.pool.publish(this.relays, verifiedEvent);
    } catch (error) {
      console.error('Error sending response:', error);
    }
  }

  // Helper to check if client has a specific permission
  private hasPermission(activation: ClientActivation | undefined, permission: string): boolean {
    if (!activation) return false;

    const permissions = activation.permissions.split(',').map(p => p.trim());
    return permissions.includes(permission);
  }

  // Load client keys from localStorage and secure storage
  private async loadClientKeys(): Promise<void> {
    const keysStorage = localStorage.getItem(STORAGE_KEYS.SIGNER_KEYS);

    if (keysStorage) {
      try {
        // Parse stored keys
        const storedKeys = JSON.parse(keysStorage);
        const validKeys: NostrAccount[] = [];

        // For each key, try to get the private key from secure storage
        for (const keyMeta of storedKeys) {
          if (this.tauriService.useBrowserStorage()) {
            // If using browser storage, just use the keys as they are
            if (keyMeta.privateKey) {
              validKeys.push({
                publicKey: keyMeta.publicKey,
                privateKey: keyMeta.privateKey
              });
            }
          } else {
            // Try to get private key from secure storage
            const privateKey = await this.tauriService.getPrivateKey(keyMeta.publicKey);

            if (privateKey) {
              // If we got the key from secure storage, use it
              validKeys.push({
                publicKey: keyMeta.publicKey,
                privateKey
              });
            } else if (keyMeta.privateKey) {
              // If not found in secure storage but available in localStorage
              validKeys.push({
                publicKey: keyMeta.publicKey,
                privateKey: keyMeta.privateKey
              });

              // Try to store it securely for future use
              await this.tauriService.savePrivateKey(keyMeta.publicKey, keyMeta.privateKey);
            }
          }
        }

        this.keys.set(validKeys);
      } catch (e) {
        console.error('Error parsing stored keys:', e);
        this.keys.set([]);
      }
    } else {
      this.keys.set([]);
    }
  }

  // Load the signer key from secure storage or local storage
  private async loadSignerKey(): Promise<void> {
    const signerKeyString = localStorage.getItem(STORAGE_KEYS.SIGNER_KEY);
    if (signerKeyString) {
      try {
        const signerKey = JSON.parse(signerKeyString);

        if (this.tauriService.useBrowserStorage()) {
          // If using browser storage, just use the key as it is
          if (signerKey.privateKey) {
            this.account.set(signerKey);
          } else {
            this.account.set(null);
          }
        } else {
          // Try to get the private key from secure storage first
          const privateKey = await this.tauriService.getPrivateKey(signerKey.publicKey);

          if (privateKey) {
            // If found in secure storage, use it
            this.account.set({
              ...signerKey,
              privateKey
            });
          } else if (signerKey.privateKey) {
            // If available in localStorage, use it and try to store securely
            this.account.set(signerKey);
            await this.tauriService.savePrivateKey(signerKey.publicKey, signerKey.privateKey);
          } else {
            // No private key available
            this.account.set(null);
          }
        }
      } catch (e) {
        console.error('Error parsing stored signer key:', e);
        this.account.set(null);
      }
    } else {
      this.account.set(null);
    }
  }

  // Save the signer key to localStorage and secure storage if available
  private async saveSignerKey(account: NostrAccount): Promise<void> {
    // Try to store private key securely
    await this.tauriService.savePrivateKey(account.publicKey, account.privateKey);

    // Store in localStorage, either with or without privateKey based on secure storage success
    localStorage.setItem(STORAGE_KEYS.SIGNER_KEY, JSON.stringify(
      this.tauriService.useBrowserStorage() ?
        account : // When using browser storage, store full account with privateKey
        { publicKey: account.publicKey, secret: account.secret } // When using secure storage, don't store privateKey in localStorage
    ));

    this.account.set(account);
  }

  // Generate a new Nostr account
  async generateAccount(privateKey?: Uint8Array): Promise<void> {
    try {
      const secret = uuidv4();

      let privateKeyClient = privateKey ?? generateSecretKey();
      let publicKeyClient = getPublicKey(privateKeyClient);
      const privateKeyHex = bytesToHex(privateKeyClient);

      const keyPairClient: NostrAccount = {
        publicKey: publicKeyClient,
        privateKey: privateKeyHex
      };

      // Try to store private key securely
      await this.tauriService.savePrivateKey(publicKeyClient, privateKeyHex);

      // Update in-memory state
      this.keys.update(array => [...array, keyPairClient]);

      // Save to localStorage, either with or without privateKey based on secure storage success
      const keysForStorage = this.keys().map(key => {
        return this.tauriService.useBrowserStorage()
          ? key  // When using browser storage, store complete key
          : { publicKey: key.publicKey }; // When using secure storage, only store publicKey
      });

      localStorage.setItem(STORAGE_KEYS.SIGNER_KEYS, JSON.stringify(keysForStorage));

      // Log the new client key generation
      this.logService.addEntry(
        LogType.KEY_GENERATED,
        `Client key generated`,
        { publicKey: publicKeyClient },
        publicKeyClient
      );

      // When a new client identity is created, register a placeholder activation
      this.addClientActivation('pending', publicKeyClient, secret);
    } catch (error) {
      console.error('Error generating Nostr account:', error);
    }
  }

  async generateSignerAccount(): Promise<void> {
    try {
      let privateKey = generateSecretKey();
      let publicKey = getPublicKey(privateKey);
      const privateKeyHex = bytesToHex(privateKey);

      const keyPair: NostrAccount = {
        publicKey,
        privateKey: privateKeyHex
      };

      // Save as signer key
      await this.saveSignerKey(keyPair);

      // Log the signer key generation
      this.logService.addEntry(
        LogType.KEY_GENERATED,
        `Signer key generated`,
        { publicKey },
        publicKey
      );

      // Generate client account
      await this.generateAccount();

      // Connect to relays after generating signer
      this.connect();

      // Navigate to the setup page to display the connection URL
      this.router.navigate(['/setup']);
    } catch (error) {
      console.error('Error generating Nostr account:', error);
    }
  }

  // Import an existing Nostr private key (nsec)
  async importSignerAccount(nsecKey: string): Promise<boolean> {
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
        } catch (e) {
          console.error('Invalid hex format:', e);
          return false;
        }
      }

      const publicKey = getPublicKey(privateKeyBytes);
      const privateKeyHex = bytesToHex(privateKeyBytes);

      const keyPair: NostrAccount = {
        publicKey,
        privateKey: privateKeyHex
      };

      await this.saveSignerKey(keyPair);

      // Generate a client account 
      await this.generateAccount();

      // Make sure we connect after importing signer identity
      this.connect();

      this.router.navigate(['/setup']);
      return true;
    } catch (error) {
      console.error('Error importing Nostr account:', error);
      return false;
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
        } catch (e) {
          console.error('Invalid hex format:', e);
          return false;
        }
      }

      await this.generateAccount(privateKeyBytes);
      return true;
    } catch (error) {
      console.error('Error importing Nostr account:', error);
      return false;
    }
  }

  getClientKey(publicKey: string): NostrAccount | undefined {
    return this.keys().find(key => key.publicKey === publicKey);
  }

  // Reset all accounts
  async reset(): Promise<void> {
    // Try to delete private keys from secure storage
    for (const key of this.keys()) {
      await this.tauriService.deletePrivateKey(key.publicKey);
    }

    if (this.account()) {
      await this.tauriService.deletePrivateKey(this.account()!.publicKey);
    }

    // Clear in-memory state and localStorage
    this.keys.set([]);
    this.account.set(null);
    this.clientActivations.set([]);
    localStorage.removeItem(STORAGE_KEYS.SIGNER_KEYS);
    localStorage.removeItem(STORAGE_KEYS.SIGNER_KEY);
    localStorage.removeItem(STORAGE_KEYS.SIGNER_CLIENTS);
    localStorage.removeItem(STORAGE_KEYS.RELAYS);
    this.logService.clearLogs();
    this.router.navigate(['/']);
  }

  // Delete a specific key by publicKey
  async deleteKey(publicKey: string): Promise<void> {
    // Try to remove from secure storage
    await this.tauriService.deletePrivateKey(publicKey);

    // Update in-memory state
    this.keys.update(keys => keys.filter(key => key.publicKey !== publicKey));

    // Update localStorage
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

  // Convert to hex if the key is in npub format
  convertToHexIfNeeded(key: string): string {
    if (key.startsWith('npub')) {
      try {
        // Use nip19.decode to convert npub to hex
        const decoded = nip19.decode(key);
        if (decoded.type === 'npub') {
          return decoded.data as string;
        }
      } catch (e) {
        console.error('Error decoding npub:', e);
      }
    }
    return key; // Return the original if it's already hex or conversion fails
  }

  // Convert to npub if the key is in hex format
  convertToNpubIfNeeded(key: string): string {
    if (!key.startsWith('npub')) {
      try {
        // Use nip19.npubEncode to convert hex to npub
        return nip19.npubEncode(key);
      } catch (e) {
        console.error('Error encoding to npub:', e);
      }
    }
    return key; // Return the original if it's already npub or conversion fails
  }

  // Generate connection URL for a given activation
  getConnectionUrl(clientActivation: ClientActivation): string {
    // Get the active signer account's public key (this is used as the remote signer)
    const signerPublicKey = this.account()?.publicKey;

    if (!signerPublicKey || !clientActivation.secret) {
      return '';
    }

    // Format each relay with "relay=" prefix and join with &
    const relaysParam = this.relays.map(relay => `relay=${relay}`).join('&');

    return `bunker://${signerPublicKey}?${relaysParam}&secret=${clientActivation.secret}`;
  }

  // Legacy method for backward compatibility
  getConnectionUrlForAccount(account: NostrAccount): string {
    // Format each relay with "relay=" prefix and join with &
    const relaysParam = this.relays.map(relay => `relay=${relay}`).join('&');
    const signerPublicKey = this.account()?.publicKey || account.publicKey;

    return `bunker://${signerPublicKey}?${relaysParam}&secret=${account.secret}`;
  }

  // Clean up on app exit or destruction
  cleanup(): void {
    // Clear the connection check interval
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    // Close pool connections
    if (this.pool) {
      console.log('POOL CLOSE IN CLEANUP!');
      this.pool.close(this.relays);
    }
  }
}
