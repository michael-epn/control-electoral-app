import { bootstrapApplication } from '@angular/platform-browser';
import { provideIonicAngular } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  cameraOutline,
  checkmarkCircleOutline,
  locationOutline,
  logOutOutline,
  personAddOutline,
  refreshOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

addIcons({
  alertCircleOutline,
  cameraOutline,
  checkmarkCircleOutline,
  locationOutline,
  logOutOutline,
  personAddOutline,
  refreshOutline,
  shieldCheckmarkOutline,
});

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    provideIonicAngular({ mode: 'md' }),
    ...(appConfig.providers ?? []),
  ],
}).catch((error: unknown) => console.error(error));
