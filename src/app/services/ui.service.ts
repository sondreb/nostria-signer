import { Injectable, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class UiService {
  theme = signal<Theme>('light');
  
  constructor() {
    this.initTheme();
  }
  
  private initTheme(): void {
    // Check if user has a preference saved
    const savedTheme = localStorage.getItem('nostria-theme') as Theme | null;
    
    // If saved preference exists, use it
    if (savedTheme) {
      this.theme.set(savedTheme);
      this.applyTheme(savedTheme);
      return;
    }
    
    // Otherwise check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme: Theme = prefersDark ? 'dark' : 'light';
    
    this.theme.set(theme);
    this.applyTheme(theme);
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (localStorage.getItem('nostria-theme')) return; // Don't override user preference
      
      const newTheme: Theme = e.matches ? 'dark' : 'light';
      this.theme.set(newTheme);
      this.applyTheme(newTheme);
    });
  }
  
  toggleTheme(): void {
    const newTheme: Theme = this.theme() === 'light' ? 'dark' : 'light';
    this.theme.set(newTheme);
    localStorage.setItem('nostria-theme', newTheme);
    this.applyTheme(newTheme);
  }
  
  private applyTheme(theme: Theme): void {
    document.documentElement.classList.remove('light-theme', 'dark-theme');
    document.documentElement.classList.add(`${theme}-theme`);
    
    // Force a re-render of any component that might have hardcoded colors
    setTimeout(() => {
      // This timeout helps ensure CSS variables have been updated
      const event = new CustomEvent('theme-changed', { detail: { theme } });
      window.dispatchEvent(event);
    }, 10);
  }
  
  applyPageTransition(): void {
    const main = document.querySelector('main');
    if (!main) return;
    
    main.classList.add('page-transition');
    setTimeout(() => {
      main.classList.remove('page-transition');
    }, 300);
  }
}
