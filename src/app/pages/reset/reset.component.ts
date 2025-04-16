import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NostrService } from '../../services/nostr.service';
import { ToastService } from '../../services/toast.service';
import { LogService, LogType } from '../../services/log.service';
import { ThemeSwitcherComponent } from '../../components/theme-switcher/theme-switcher.component';

@Component({
  selector: 'app-reset',
  standalone: true,
  imports: [CommonModule, ThemeSwitcherComponent],
  templateUrl: './reset.component.html',
  styleUrls: ['./reset.component.css']
})
export class ResetComponent {
  private router = inject(Router);
  private nostrService = inject(NostrService);
  private toastService = inject(ToastService);
  private logService = inject(LogService);
  
  keys = this.nostrService.keys;
  account = this.nostrService.account;
  isConfirming = signal<boolean>(false);
  typedConfirmation = signal<string>('');
  showHexFormat = signal<Record<string, boolean>>({});

  confirmReset(): void {
    this.isConfirming.set(true);
  }

  cancelReset(): void {
    this.router.navigate(['/setup']);
  }

  async executeReset(): Promise<void> {
    if (this.typedConfirmation() === 'RESET') {
      await this.nostrService.reset();
      this.toastService.show('All keys have been reset', 'info');
      this.logService.addEntry(LogType.CONNECTION, 'All keys have been reset');
      // Router navigation is handled in the NostrService.reset() method
    } else {
      this.toastService.show('Incorrect confirmation text', 'error');
    }
  }

  updateConfirmation(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.typedConfirmation.set(input.value);
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
}
