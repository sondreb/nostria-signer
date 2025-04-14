import { Component, inject, signal } from '@angular/core';
import { ClientActivation, NostrAccount, NostrService } from '../../services/nostr.service';
import { UiService } from '../../services/ui.service';
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
  private uiService = inject(UiService);

  keys = this.nostrService.keys;
  account = this.nostrService.account;
  clientActivations = this.nostrService.clientActivations;
  showPrivateKeys = signal<Record<string, boolean>>({});
  activeTab = signal<'clients' | 'signer' | 'relays'>('clients');
  relays = signal<string[]>([]);
  newRelay = signal<string>('');
  editingPermissions = signal<Record<string, boolean>>({});
  permissionsInput = signal<Record<string, string>>({});
  showImportModal = signal<boolean>(false);
  importKeyValue = signal<string>('');
  importError = signal<string | null>(null);
  importSuccess = signal<boolean>(false);
  // Add a signal to track which keys are displaying in hex format (default is npub)
  showHexFormat = signal<Record<string, boolean>>({});
  theme = this.uiService.theme;

  constructor() {}

  ngOnInit() {
    // Initialize relays signal with values from the service
    this.relays.set([...this.nostrService.relays]);
  }

  toggleImportModal(): void {
    this.showImportModal.update(current => !current);
    // Reset form when toggling
    if (this.showImportModal()) {
      this.importKeyValue.set('');
      this.importError.set(null);
      this.importSuccess.set(false);
    }
  }

  async importKey(): Promise<void> {
    this.importError.set(null);
    this.importSuccess.set(false);
    
    const keyValue = this.importKeyValue().trim();
    if (!keyValue) {
      this.importError.set('Please enter a private key in nsec or hex format.');
      return;
    }

    try {
      const success = await this.nostrService.importAccount(keyValue);
      if (success) {
        this.importSuccess.set(true);
        // Close the modal after a short delay
        setTimeout(() => {
          this.showImportModal.set(false);
        }, 1500);
      } else {
        this.importError.set('Failed to import the key. Please check the format and try again.');
      }
    } catch (error) {
      console.error('Error importing key:', error);
      this.importError.set('An unexpected error occurred. Please try again.');
    }
  }

  setActiveTab(tab: 'clients' | 'signer' | 'relays') {
    this.activeTab.set(tab);
  }

  hasKeys() {
    return this.keys().length > 0;
  }

  getConnectionUrl(activation: ClientActivation): string {
    return this.nostrService.getConnectionUrl(activation);
  }

  isPendingActivation(activation: ClientActivation): boolean {
    return activation.clientPubkey === 'pending';
  }

  generateNewActivation(publicKey: string): void {
    this.nostrService.generateNewActivation(publicKey);
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

  // Add method to toggle between npub and hex format
  togglePubkeyFormat(publicKey: string): void {
    this.showHexFormat.update(formats => {
      const currentFormats = { ...formats };
      currentFormats[publicKey] = !currentFormats[publicKey];
      return currentFormats;
    });
  }

  // Method to check if hex format is active for a specific key
  isHexFormatActive(publicKey: string): boolean {
    return !!this.showHexFormat()[publicKey];
  }

  // Method to get the display format of the public key
  getDisplayPublicKey(publicKey: string): string {
    if (this.isHexFormatActive(publicKey)) {
      // If hex format is active, show the raw hex (could be from npub or directly a hex key)
      return this.nostrService.convertToHexIfNeeded(publicKey);
    }
    // Otherwise show the npub format
    return this.nostrService.convertToNpubIfNeeded(publicKey);
  }

  // Keep this method as a fallback for any remaining code that might use it
  copyConnectionUrl(account: NostrAccount) {
    const connectionUrl = this.nostrService.getConnectionUrlForAccount(account);
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

  getActivationsForIdentity(pubkey: string): ClientActivation[] {
    return this.nostrService.getActivationsForIdentity(pubkey);
  }

  deleteActivation(activation: ClientActivation) {
    if (confirm('Are you sure you want to delete this activation?')) {
      this.nostrService.deleteActivation(
        activation.clientPubkey, 
        activation.pubkey, 
        activation.secret!
      );
    }
  }

  updatePermissionsInput(activation: ClientActivation, value: string): void {
    const activationId = this.getActivationId(activation);
    const currentValues = { ...this.permissionsInput() };
    currentValues[activationId] = value;
    this.permissionsInput.set(currentValues);
  }

  startEditingPermissions(activation: ClientActivation) {
    const activationId = this.getActivationId(activation);
    
    // Update permissions input first
    const currentPermissions = { ...this.permissionsInput() };
    currentPermissions[activationId] = activation.permissions;
    this.permissionsInput.set(currentPermissions);
    
    // Then update editing state
    const currentEditing = { ...this.editingPermissions() };
    currentEditing[activationId] = true;
    this.editingPermissions.set(currentEditing);
  }

  savePermissions(activation: ClientActivation) {
    const activationId = this.getActivationId(activation);
    const newPermissions = this.permissionsInput()[activationId] || '';
    
    this.nostrService.updateActivationPermissions(
      activation.clientPubkey,
      activation.pubkey,
      activation.secret!,
      newPermissions
    );
    
    // Update editing state
    const currentEditing = { ...this.editingPermissions() };
    currentEditing[activationId] = false;
    this.editingPermissions.set(currentEditing);
  }

  cancelEditPermissions(activation: ClientActivation) {
    const activationId = this.getActivationId(activation);
    
    // Update editing state
    const currentEditing = { ...this.editingPermissions() };
    currentEditing[activationId] = false;
    this.editingPermissions.set(currentEditing);
  }

  isEditingPermissions(activation: ClientActivation): boolean {
    const activationId = this.getActivationId(activation);
    return !!this.editingPermissions()[activationId];
  }

  getActivationId(activation: ClientActivation): string {
    return `${activation.clientPubkey}:${activation.pubkey}:${activation.secret}`;
  }

  formatPermissions(permissionsString: string): string {
    return this.nostrService.formatPermissionsForDisplay(permissionsString);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  toggleTheme() {
    this.uiService.toggleTheme();
  }
}
