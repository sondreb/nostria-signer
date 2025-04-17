import { Component, OnDestroy, inject, HostListener, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { NostrService } from './services/nostr.service';
import { ToastComponent } from './components/toast/toast.component';
import { WebLockService } from './services/web-lock.service';
import { LogService, LogType } from './services/log.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ToastComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast></app-toast>
  `
})
export class AppComponent implements OnInit, OnDestroy {
  private nostrService = inject(NostrService);
  private webLockService = inject(WebLockService);
  private logService = inject(LogService);

  // Track if web lock is supported
  webLockSupported = this.webLockService.isSupported;

  constructor() {
    // Setup monitoring when NostrService changes connection status
    effect(() => {
      const status = this.nostrService.connectionStatus();
      if (status === 'connected') {
        // Ensure web lock is active when connected
        this.webLockService.requestLock();
      }
    });
  }

  ngOnInit(): void {
    // Request a web lock to keep the app active in background
    this.initializeWebLock();

    // Log wake lock support status
    if (this.webLockSupported) {
      this.logService.addEntry(
        LogType.CONNECTION,
        'Wake Lock API is supported, screen will stay active'
      );
    } else {
      this.logService.addEntry(
        LogType.CONNECTION,
        'Wake Lock API is not supported in this browser, screen may dim or turn off'
      );
    }


  }

  // Initialize web lock
  private async initializeWebLock(): Promise<void> {
    if (this.webLockSupported) {
      const success = await this.webLockService.requestLock();
      if (success) {
        console.log('Web lock acquired successfully');
      } else {
        console.warn('Failed to acquire web lock');
      }
    }
  }

  // Handle beforeunload event to clean up connections
  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.nostrService.cleanup();
    this.webLockService.releaseLock();
  }

  // Cleanup when component is destroyed
  ngOnDestroy(): void {
    this.cleanup();
  }
}
