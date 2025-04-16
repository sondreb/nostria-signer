import { Injectable, signal } from '@angular/core';
import { STORAGE_KEYS } from './nostr.service';

export enum LogType {
  EVENT_RECEIVED = 'event-received',
  SIGN_REQUEST = 'sign-request',
  ENCRYPTION = 'encryption',
  CONNECTION = 'connection',
  ERROR = 'error'
}

export interface LogEntry {
  id: number;
  timestamp: Date;
  type: LogType;
  message: string;
  details?: any;
  pubkey?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LogService {
  private nextId = 1;
  private maxLogEntries = 1000; // Limit log entries to prevent memory issues
  logEntries = signal<LogEntry[]>([]);
  
  constructor() {
    this.loadLogsFromStorage();
    this.addEntry(LogType.CONNECTION, 'Log service initialized');
  }
  
  // Load existing logs from localStorage
  private loadLogsFromStorage(): void {
    try {
      const storedLogs = localStorage.getItem(STORAGE_KEYS.SIGNER_LOGS);
      if (storedLogs) {
        const logs = JSON.parse(storedLogs);
        
        // Convert string timestamps back to Date objects
        const parsedLogs = logs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }));
        
        this.logEntries.set(parsedLogs);
        
        // Set nextId to be one more than the highest id in the logs
        if (parsedLogs.length > 0) {
          const maxId = Math.max(...parsedLogs.map((log: { id: any; }) => log.id));
          this.nextId = maxId + 1;
        }
      }
    } catch (error) {
      console.error('Error loading logs from localStorage:', error);
      // If there's an error, start with empty logs
      this.logEntries.set([]);
    }
  }
  
  // Save logs to localStorage
  private saveLogsToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SIGNER_LOGS, JSON.stringify(this.logEntries()));
    } catch (error) {
      console.error('Error saving logs to localStorage:', error);
      
      // If we hit storage limits, trim the logs further and try again
      if (error instanceof DOMException && 
          (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        this.logEntries.update(entries => entries.slice(0, Math.floor(entries.length / 2)));
        try {
          localStorage.setItem(STORAGE_KEYS.SIGNER_LOGS, JSON.stringify(this.logEntries()));
        } catch (retryError) {
          console.error('Failed to save logs even after trimming:', retryError);
        }
      }
    }
  }
  
  addEntry(type: LogType, message: string, details?: any, pubkey?: string): void {
    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: new Date(),
      type,
      message,
      details,
      pubkey
    };
    
    this.logEntries.update(entries => {
      // Add the new entry to the beginning of the array for most recent first
      const updatedEntries = [entry, ...entries];
      
      // Trim the array if it exceeds the maximum size
      if (updatedEntries.length > this.maxLogEntries) {
        return updatedEntries.slice(0, this.maxLogEntries);
      }
      
      return updatedEntries;
    });
    
    // Save updated logs to localStorage
    this.saveLogsToStorage();
  }
  
  clearLogs(): void {
    this.logEntries.set([]);
    // Clear from localStorage too
    localStorage.removeItem(STORAGE_KEYS.SIGNER_LOGS);
    this.addEntry(LogType.CONNECTION, 'Logs cleared');
  }
  
  getFilteredLogs(type?: LogType | string, pubkey?: string): LogEntry[] {
    return this.logEntries().filter(entry => {
      let matchesType = true;
      let matchesPubkey = true;
      
      if (type) {
        matchesType = entry.type === type;
      }
      
      if (pubkey) {
        matchesPubkey = entry.pubkey === pubkey;
      }
      
      return matchesType && matchesPubkey;
    });
  }
}
