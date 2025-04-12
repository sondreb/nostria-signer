import { Component, inject, signal } from '@angular/core';
import { NostrService } from '../../services/nostr.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  private nostrService = inject(NostrService);
  
  showImport = signal<boolean>(false);
  importedKey = signal<string>('');
  importError = signal<string | null>(null);
  
  async onGetStarted(): Promise<void> {
    await this.nostrService.generateAccount();
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
    
    const success = await this.nostrService.importAccount(key.trim());
    
    if (!success) {
      this.importError.set('Invalid private key format. Please check and try again.');
    }
  }
}
