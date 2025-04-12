import { Component, inject } from '@angular/core';
import { NostrAccount, NostrService } from '../../services/nostr.service';
import { CommonModule } from '@angular/common';
import { kinds, nip44, SimplePool } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { v2 } from 'nostr-tools/nip44';
import { hexToBytes } from '@noble/hashes/utils';


@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.css']
})
export class SetupComponent {
  private nostrService = inject(NostrService);

  keys = this.nostrService.keys;

  pool: SimplePool;

  constructor() {
    this.pool = new SimplePool();

  }

  ngOnInit() {
    // this.pool.subscribe('')
    this.pool.subscribeMany(this.nostrService.relays, [
      {
        kinds: [kinds.NostrConnect],
        ['#p']: ['23cba1afe0a23313007114d36d62cc52bf938483fe459a44868ac06856cf247e'],
      },
    ],
      {
        onevent: (evt) => {
          console.log('Event received', evt);

          // this.keys()[0].privateKey

          const privateKeyHex = this.keys()[0].privateKey;
          const privateKey = hexToBytes(privateKeyHex);

          // The content of evt is a NIP-44 encrypted event, decrypt it:
          const convKey = v2.utils.getConversationKey(privateKey, evt.pubkey);

          const decrypted = v2.decrypt(evt.content, convKey);
          console.log('Decrypted content:', decrypted);
          console.log(JSON.stringify(decrypted, null, 2));
        },

        onclose: (reasons) => {
          console.log('Pool closed', reasons);
        },
      }
    );

    console.log('Connected to relays:', this.nostrService.relays);
  }

  hasKeys() {
    return this.keys().length > 0;
  }

  getConnectionUrl(account: NostrAccount): string {
    return this.nostrService.getConnectionUrl(account);
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert('Copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  }

  copyConnectionUrl(account: NostrAccount) {
    const connectionUrl = this.nostrService.getConnectionUrl(account);
    this.copyToClipboard(connectionUrl);
  }

  resetAllKeys() {
    if (confirm('Are you sure you want to reset all keys? This action cannot be undone.')) {
      this.nostrService.reset();
    }
  }

  deleteKey(publicKey: string) {
    if (confirm('Are you sure you want to delete this key? This action cannot be undone.')) {
      this.nostrService.deleteKey(publicKey);
    }
  }

  generateNewKey() {
    this.nostrService.generateAccount();
  }
}
