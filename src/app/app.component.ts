import { Component, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { NostrService } from './services/nostr.service';
import { ToastComponent } from './components/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ToastComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast></app-toast>
  `
})
export class AppComponent implements OnDestroy {
  private nostrService = inject(NostrService);
  
  // Handle beforeunload event to clean up connections
  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    this.nostrService.cleanup();
  }
  
  // Cleanup when component is destroyed
  ngOnDestroy(): void {
    this.nostrService.cleanup();
  }
}
