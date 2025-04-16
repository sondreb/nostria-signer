import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './components/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ToastComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast></app-toast>
  `,
})
export class AppComponent {
  title = 'Nostria Signer';
}
