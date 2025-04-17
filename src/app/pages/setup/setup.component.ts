import { Component, inject, signal, effect } from '@angular/core';
import { ClientActivation, NostrAccount, NostrService } from '../../services/nostr.service';
import { UiService } from '../../services/ui.service';
import { CommonModule } from '@angular/common';
import { kinds, nip44, SimplePool } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { v2 } from 'nostr-tools/nip44';
import { hexToBytes } from '@noble/hashes/utils';
import { FormsModule } from '@angular/forms';
import { ThemeSwitcherComponent } from '../../components/theme-switcher/theme-switcher.component';
import { ToastService } from '../../services/toast.service';
import { LogService, LogType } from '../../services/log.service';
import { TauriService } from '../../services/tauri.service';
import QRCode from 'qrcode';
import { Router } from '@angular/router';
import { WebLockService } from '../../services/web-lock.service';
import {
  cancelAll,
  isPermissionGranted,
  removeAllActive,
  requestPermission,
  Schedule,
  ScheduleEvery,
  ScheduleInterval,
  sendNotification
} from '@tauri-apps/plugin-notification'

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, ThemeSwitcherComponent],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.css']
})
export class SetupComponent {
  private nostrService = inject(NostrService);
  private uiService = inject(UiService);
  private toastService = inject(ToastService);
  private logService = inject(LogService);
  tauriService = inject(TauriService);
  private router = inject(Router);
  private webLockService = inject(WebLockService);

  keys = this.nostrService.keys;
  account = this.nostrService.account;
  clientActivations = this.nostrService.clientActivations;
  showPrivateKeys = signal<Record<string, boolean>>({});
  activeTab = signal<'clients' | 'signer' | 'relays' | 'log'>('clients');
  relays = signal<string[]>([]);
  newRelay = signal<string>('');
  editingPermissions = signal<Record<string, boolean>>({});
  permissionsInput = signal<Record<string, string>>({});
  showImportModal = signal<boolean>(false);
  importKeyValue = signal<string>('');
  importError = signal<string | null>(null);
  importSuccess = signal<boolean>(false);
  showHexFormat = signal<Record<string, boolean>>({});
  theme = this.uiService.theme;
  showQrModal = signal<boolean>(false);
  qrCodeUrl = signal<string>('');
  qrCodeDataUrl = signal<string>('');
  currentQrActivation = signal<ClientActivation | null>(null);
  logFilter = signal<LogType | string | undefined>(undefined);
  logPubkeyFilter = signal<string | undefined>(undefined);
  isSecureStorage = signal<boolean | null>(null);

  // Add webLock to component properties
  webLockSupported = this.webLockService.isSupported;
  webLockActive = this.webLockService.isLocked;

  // Get connection status from service
  connectionStatus = this.nostrService.connectionStatus;

  constructor() {
    effect(async () => {
      if (this.nostrService.serviceInitialized()) {

        if (!this.nostrService.hasAccount()) {
          this.router.navigate(['/']);
          return;
        }

        await this.initializeComponent();
      }
    });

    effect(() => {
      if (this.showQrModal() && this.currentQrActivation()) {
        const activation = this.currentQrActivation();
        const stillPending = this.nostrService.clientActivations().some(a =>
          a.clientPubkey === 'pending' &&
          a.secret === activation?.secret &&
          a.pubkey === activation?.pubkey
        );
        if (!stillPending) {
          this.showQrModal.set(false);
          this.currentQrActivation.set(null);
          this.toastService.show('Client connected successfully!', 'success');
          this.logService.addEntry(LogType.CONNECTION, 'Client connected successfully');
        }
      }

      // Update secure storage status display
      this.isSecureStorage.set(!this.tauriService.useBrowserStorage());
    });
  }

  async initializeComponent(): Promise<void> {
    // Wait for NostrService to complete initialization
    this.relays.set([...this.nostrService.relays]);
  }

  toggleImportModal(): void {
    this.showImportModal.update(current => !current);
    if (this.showImportModal()) {
      this.importKeyValue.set('');
      this.importError.set(null);
      this.importSuccess.set(false);
    }
  }

  async checkPermission() {
    if (!(await isPermissionGranted())) {
      return (await requestPermission()) === 'granted';
    }

    return true;
  }

  async disableNotification() {
    cancelAll();
    removeAllActive();
  }

  async enableNotification() {
    let title = 'Nostria Signer';
    let body = 'Attempt to keep running in the background.';

    if (!(await this.checkPermission())) {
      return
    }

    // const schedule = Schedule.interval('second', 5);
    const schedule = Schedule.every(ScheduleEvery.Second, 5, true);

    sendNotification({ title, body, ongoing: true, schedule: schedule });
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
        this.logService.addEntry(LogType.CONNECTION, 'Client identity imported successfully');
        setTimeout(() => {
          this.showImportModal.set(false);
        }, 1500);
      } else {
        this.importError.set('Failed to import the key. Please check the format and try again.');
      }
    } catch (error) {
      console.error('Error importing key:', error);
      this.importError.set('An unexpected error occurred. Please try again.');
      this.logService.addEntry(LogType.ERROR, 'Failed to import key', error);
    }
  }

  setActiveTab(tab: 'clients' | 'signer' | 'relays' | 'log') {
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
    this.logService.addEntry(LogType.CONNECTION, 'New activation generated for client', null, publicKey);
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
      .then(() => {
        this.toastService.show('Copied to clipboard!', 'success');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        this.toastService.show('Failed to copy text', 'error');
        this.logService.addEntry(LogType.ERROR, 'Failed to copy to clipboard', err);
      });
  }

  togglePubkeyFormat(publicKey: string): void {
    this.showHexFormat.update(formats => {
      const currentFormats = { ...formats };
      currentFormats[publicKey] = !currentFormats[publicKey];
      return currentFormats;
    });
  }

  isHexFormatActive(publicKey: string): boolean {
    return !!this.showHexFormat()[publicKey];
  }

  getDisplayPublicKey(publicKey: string): string {
    if (this.isHexFormatActive(publicKey)) {
      return this.nostrService.convertToHexIfNeeded(publicKey);
    }
    return this.nostrService.convertToNpubIfNeeded(publicKey);
  }

  copyConnectionUrl(account: NostrAccount) {
    const connectionUrl = this.nostrService.getConnectionUrlForAccount(account);
    this.copyToClipboard(connectionUrl);
  }

  navigateToReset(): void {
    this.router.navigate(['/reset']);
  }

  deleteKey(publicKey: string) {
    if (confirm('Are you sure you want to delete this key? This action cannot be undone.')) {
      this.nostrService.deleteKey(publicKey);
      this.toastService.show('Key deleted successfully', 'success');
      this.logService.addEntry(LogType.CONNECTION, 'Key deleted', { publicKey });
    }
  }

  generateNewKey() {
    this.nostrService.generateAccount();
    this.toastService.show('New client identity generated', 'success');
    this.logService.addEntry(LogType.CONNECTION, 'New client identity generated');
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
      this.relays.update(current => [...current, relay]);
      this.updateRelays();
      this.newRelay.set('');
      this.toastService.show(`Added relay: ${relay}`, 'success');
      this.logService.addEntry(LogType.CONNECTION, `Added relay: ${relay}`);
    }
  }

  removeRelay(relay: string) {
    this.relays.update(current => current.filter(r => r !== relay));
    this.updateRelays();
    this.toastService.show(`Removed relay: ${relay}`, 'info');
    this.logService.addEntry(LogType.CONNECTION, `Removed relay: ${relay}`);
  }

  updateRelays() {
    this.nostrService.updateRelays(this.relays());
  }

  isValidUrl(url: string): boolean {
    try {
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
      this.toastService.show('Activation revoked successfully', 'success');
      this.logService.addEntry(LogType.CONNECTION, 'Activation revoked', { activation });
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
    const currentPermissions = { ...this.permissionsInput() };
    currentPermissions[activationId] = activation.permissions;
    this.permissionsInput.set(currentPermissions);
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
    const currentEditing = { ...this.editingPermissions() };
    currentEditing[activationId] = false;
    this.editingPermissions.set(currentEditing);
    this.toastService.show('Permissions updated successfully', 'success');
    this.logService.addEntry(LogType.CONNECTION, 'Permissions updated', {
      activation,
      newPermissions
    });
  }

  cancelEditPermissions(activation: ClientActivation) {
    const activationId = this.getActivationId(activation);
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

  async toggleQrModal(url?: string, activation?: ClientActivation): Promise<void> {
    if (url && !this.showQrModal()) {
      this.qrCodeUrl.set(url);
      if (activation) {
        this.currentQrActivation.set(activation);
      } else {
        this.currentQrActivation.set(null);
      }
      try {
        const dataUrl = await QRCode.toDataURL(url, {
          width: 250,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        this.qrCodeDataUrl.set(dataUrl);
      } catch (err) {
        console.error('Error generating QR code:', err);
        this.toastService.show('Failed to generate QR code', 'error');
        this.logService.addEntry(LogType.ERROR, 'Failed to generate QR code', err);
      }
    } else {
      this.currentQrActivation.set(null);
    }
    this.showQrModal.update(current => !current);
  }

  async showQrCode(activation: ClientActivation): Promise<void> {
    const url = this.getConnectionUrl(activation);
    await this.toggleQrModal(url, activation);
  }

  getFilteredLogs() {
    return this.logService.getFilteredLogs(this.logFilter(), this.logPubkeyFilter());
  }

  setLogFilter(type: LogType | string | undefined) {
    this.logFilter.set(type);
  }

  setLogPubkeyFilter(pubkey?: string) {
    this.logPubkeyFilter.set(pubkey);
  }

  clearLogs() {
    if (confirm('Are you sure you want to clear all logs?')) {
      this.logService.clearLogs();
      this.toastService.show('Logs cleared', 'info');
    }
  }

  getLogTypeIcon(type: LogType): string {
    switch (type) {
      case LogType.EVENT_RECEIVED: return '📥';
      case LogType.SIGN_REQUEST: return '✍️';
      case LogType.ENCRYPTION: return '🔒';
      case LogType.CONNECTION: return '🔗';
      case LogType.ERROR: return '⚠️';
      default: return '📋';
    }
  }

  formatLogDetails(details: any): string {
    if (!details) return '';
    try {
      return JSON.stringify(details, null, 2);
    } catch (e) {
      return String(details);
    }
  }

  resetLogFilters() {
    this.logFilter.set(undefined);
    this.logPubkeyFilter.set(undefined);
  }

  getStorageSecurityMessage(): string {
    if (this.isSecureStorage() === true) {
      return 'Your private keys are being stored securely using native OS secure storage.';
    } else {
      return 'Warning: Your private keys are being stored in browser local storage, which is less secure. For better security, use the desktop app.';
    }
  }

  // Manually trigger reconnection
  reconnectToRelays(): void {
    this.nostrService.connect();
    this.toastService.show('Attempting to reconnect to relays...', 'info');
    this.logService.addEntry(LogType.CONNECTION, 'Manual relay reconnection requested');
  }

  // Get connection status display text
  getConnectionStatusText(): string {
    switch (this.connectionStatus()) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  }

  // Get connection status class for styling
  getConnectionStatusClass(): string {
    switch (this.connectionStatus()) {
      case 'connected': return 'status-connected';
      case 'connecting': return 'status-connecting';
      case 'disconnected': return 'status-disconnected';
      default: return '';
    }
  }

  // Add method to manually toggle WebLock
  async toggleWebLock(): Promise<void> {
    if (this.webLockActive()) {
      await this.webLockService.releaseLock();
      this.toastService.show('Screen can now sleep', 'info');
    } else {
      const success = await this.webLockService.requestLock();
      if (success) {
        this.toastService.show('Screen will stay active', 'success');
      } else {
        this.toastService.show('Failed to prevent screen from sleeping', 'error');
      }
    }
  }
}
