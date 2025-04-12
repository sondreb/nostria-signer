import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { SetupComponent } from './pages/setup/setup.component';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'setup',
    component: SetupComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
