import { Component, effect, inject, signal } from '@angular/core';
import { NostrService } from '../../services/nostr.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UiService } from '../../services/ui.service';
import { ThemeSwitcherComponent } from '../../components/theme-switcher/theme-switcher.component';
import { ToastService } from '../../services/toast.service';
import { invoke } from "@tauri-apps/api/core";
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, ThemeSwitcherComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  private nostrService = inject(NostrService);
  private router = inject(Router);
  private uiService = inject(UiService);
  private toastService = inject(ToastService);

  showImport = signal<boolean>(false);
  importedKey = signal<string>('');
  importError = signal<string | null>(null);
  loading = signal<boolean>(true);
  theme = this.uiService.theme;

  constructor() {
    // Check if account exists and redirect if necessary
    this.initializeComponent();

    // Set up redirection effect
    effect(() => {
      if (this.nostrService.hasAccount() && !this.loading()) {
        this.router.navigate(['/setup']);
      }
    });
  }

  private async initializeComponent(): Promise<void> {
    // Check if an account already exists
    await this.nostrService.checkExistingAccount();
    this.loading.set(false);
  }

  async onGetStarted(): Promise<void> {
    await this.nostrService.generateSignerAccount();
    this.toastService.show('Signer account generated successfully', 'success');
  }

  async verifyStorage() {
    console.log('Attempting to verify OS device secure storage...');

    let privateKey = generateSecretKey();
    let publicKeyHex = getPublicKey(privateKey);
    let privateKeyHex = bytesToHex(privateKey);

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
  }

  toggleImportView(): void {
    this.showImport.update(value => !value);
    this.importError.set(null);
  }

  async onImportKey(): Promise<void> {
    const key = this.importedKey();

    if (!key || key.trim() === '') {
      this.importError.set('Please enter a valid private key');
      return;
    }

    const success = await this.nostrService.importSignerAccount(key.trim());

    if (!success) {
      this.importError.set('Invalid private key format. Please check and try again.');
    } else {
      this.toastService.show('Signer key imported successfully', 'success');
    }
  }

  toggleTheme(): void {
    this.uiService.toggleTheme();
  }
}
