import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private nextId = 0;
  toasts = signal<Toast[]>([]);
  
  show(message: string, type: ToastType = 'info', duration: number = 3000): void {
    const id = this.nextId++;
    
    const toast: Toast = {
      id,
      message,
      type,
      duration
    };
    
    // Add the new toast to the array
    this.toasts.update(currentToasts => [...currentToasts, toast]);
    
    // Automatically remove the toast after the specified duration
    setTimeout(() => {
      this.remove(id);
    }, duration);
  }
  
  remove(id: number): void {
    this.toasts.update(currentToasts => 
      currentToasts.filter(toast => toast.id !== id)
    );
  }
}
