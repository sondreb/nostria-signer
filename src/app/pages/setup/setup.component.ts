import { Component, inject, signal } from '@angular/core';
import { NostrAccount, NostrService } from '../../services/nostr.service';
import { CommonModule } from '@angular/common';
import { kinds, nip44, SimplePool } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { v2 } from 'nostr-tools/nip44';
import { hexToBytes } from '@noble/hashes/utils';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.css']
})
export class SetupComponent {
  private nostrService = inject(NostrService);

  keys = this.nostrService.keys;
  account = this.nostrService.account;
  showPrivateKeys = signal<Record<string, boolean>>({});
  activeTab = signal<'clients' | 'signer' | 'relays'>('clients');
  relays = signal<string[]>([]);
  newRelay = signal<string>('');

  constructor() {
    // this.pool = new SimplePool();
  }

  ngOnInit() {
    // Initialize relays signal with values from the service
    this.relays.set([...this.nostrService.relays]);
  }

  setActiveTab(tab: 'clients' | 'signer' | 'relays') {
    this.activeTab.set(tab);
  }

  hasKeys() {
    return this.keys().length > 0;
  }

  getConnectionUrl(account: NostrAccount): string {
    return this.nostrService.getConnectionUrl(account);
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert('Copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  }

  copyConnectionUrl(account: NostrAccount) {
    const connectionUrl = this.nostrService.getConnectionUrl(account);
    this.copyToClipboard(connectionUrl);
  }

  resetAllKeys() {
    if (confirm('Are you sure you want to reset all keys? This action cannot be undone.')) {
      this.nostrService.reset();
    }
  }

  deleteKey(publicKey: string) {
    if (confirm('Are you sure you want to delete this key? This action cannot be undone.')) {
      this.nostrService.deleteKey(publicKey);
    }
  }

  generateNewKey() {
    this.nostrService.generateAccount();
  }

  togglePrivateKeyVisibility(publicKey: string): void {
    this.showPrivateKeys.update(keys => {
      const currentKeys = { ...keys };
      currentKeys[publicKey] = !currentKeys[publicKey];
      return currentKeys;
    });
  }

  isPrivateKeyVisible(publicKey: string): boolean {
    return !!this.showPrivateKeys()[publicKey];
  }

  addRelay() {
    const relay = this.newRelay().trim();
    if (relay && !this.relays().includes(relay)) {
      // Add new relay
      this.relays.update(current => [...current, relay]);
      // Update service
      this.updateRelays();
      // Reset input
      this.newRelay.set('');
    }
  }

  removeRelay(relay: string) {
    this.relays.update(current => current.filter(r => r !== relay));
    this.updateRelays();
  }

  updateRelays() {
    this.nostrService.updateRelays(this.relays());
  }

  isValidUrl(url: string): boolean {
    try {
      // Simple validation - checks if it's a valid WebSocket URL
      return url.trim().startsWith('wss://') || url.trim().startsWith('ws://');
    } catch {
      return false;
    }
  }
}
