import { Injectable, NgZone, inject, signal } from '@angular/core';
import { LogService, LogType } from './log.service';

/**
 * Service to manage Wake Lock (WebLock) to prevent the device
 * from dimming or turning off the screen when the app is running.
 */
@Injectable({
  providedIn: 'root'
})
export class WebLockService {
  private logService = inject(LogService);
  private ngZone = inject(NgZone);
  
  // Wake Lock reference
  private wakeLock: any = null;
  
  // Signal to track if wake lock is active
  isLocked = signal<boolean>(false);
  
  // Check if Wake Lock API is supported
  get isSupported(): boolean {
    return 'wakeLock' in navigator;
  }
  
  constructor() {
    if (!this.isSupported) {
      console.warn('Wake Lock API is not supported in this browser');
    }
    
    // Set up event listeners for visibility changes
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.addEventListener('focus', this.reacquireLock.bind(this));
  }
  
  /**
   * Request a wake lock to prevent the device from sleeping
   * @returns Promise resolving to a boolean indicating success
   */
  async requestLock(): Promise<boolean> {
    if (!this.isSupported) {
      return false;
    }
    
    // If we already have a lock, return true
    if (this.wakeLock) {
      return true;
    }
    
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      
      this.ngZone.run(() => {
        this.isLocked.set(true);
        this.logService.addEntry(
          LogType.CONNECTION,
          'Wake Lock acquired - screen will stay active'
        );
      });
      
      // Add release event listener
      this.wakeLock.addEventListener('release', () => {
        this.ngZone.run(() => {
          this.isLocked.set(false);
          this.logService.addEntry(
            LogType.CONNECTION,
            'Wake Lock released'
          );
          this.wakeLock = null;
        });
      });
      
      return true;
    } catch (err) {
      console.error('Failed to request wake lock:', err);
      this.ngZone.run(() => {
        this.isLocked.set(false);
        this.logService.addEntry(
          LogType.ERROR,
          `Failed to acquire Wake Lock: ${err instanceof Error ? err.message : String(err)}`
        );
      });
      return false;
    }
  }
  
  /**
   * Release the wake lock if it's currently active
   */
  async releaseLock(): Promise<void> {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        this.isLocked.set(false);
      } catch (err) {
        console.error('Failed to release wake lock:', err);
      }
    }
  }
  
  /**
   * Attempt to reacquire the lock if we previously had one
   */
  private async reacquireLock(): Promise<void> {
    if (this.isLocked() && !this.wakeLock && document.visibilityState === 'visible') {
      await this.requestLock();
    }
  }
  
  /**
   * Handle visibility change events to manage the wake lock
   */
  private async handleVisibilityChange(): Promise<void> {
    if (document.visibilityState === 'visible' && this.isLocked() && !this.wakeLock) {
      // Try to reacquire the lock when the page becomes visible again
      await this.requestLock();
    }
  }
  
  /**
   * Clean up resources when the service is destroyed
   */
  async cleanup(): Promise<void> {
    await this.releaseLock();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.removeEventListener('focus', this.reacquireLock.bind(this));
  }
}
