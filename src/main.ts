import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import './app/layout-fixes.css'; // Import the layout fixes

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
