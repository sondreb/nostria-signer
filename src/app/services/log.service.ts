import { Injectable, signal } from '@angular/core';

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
    this.addEntry(LogType.CONNECTION, 'Log service initialized');
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
  }
  
  clearLogs(): void {
    this.logEntries.set([]);
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
