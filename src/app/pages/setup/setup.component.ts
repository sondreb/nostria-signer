import { Component, inject } from '@angular/core';
import { NostrAccount, NostrService } from '../../services/nostr.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.css']
})
export class SetupComponent {
  private nostrService = inject(NostrService);
  
  keys = this.nostrService.keys;
  
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
}
