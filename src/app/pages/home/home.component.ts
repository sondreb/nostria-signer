import { Component, inject } from '@angular/core';
import { NostrService } from '../../services/nostr.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  private nostrService = inject(NostrService);
  
  async onGetStarted(): Promise<void> {
    await this.nostrService.generateAccount();
  }
}
