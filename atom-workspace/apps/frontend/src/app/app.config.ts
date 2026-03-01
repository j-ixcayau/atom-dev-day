import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getAuth, provideAuth } from '@angular/fire/auth';

const firebaseConfig = {
  projectId: "atom-dev-day",
  appId: "1:199386075319:web:bd9b4d3190fc7b54627d32",
  storageBucket: "atom-dev-day.firebasestorage.app",
  apiKey: "AIzaSyAqvj-G5SupTN0Wmc7RvnAqEzIr3XXqKNg",
  authDomain: "atom-dev-day.firebaseapp.com",
  messagingSenderId: "199386075319",
  measurementId: "G-0TL77BYPND",
};

export const appConfig: ApplicationConfig = {
  providers: [
     provideBrowserGlobalErrorListeners(),
     provideRouter(appRoutes),
     provideFirebaseApp(() => initializeApp(firebaseConfig)),
     provideAuth(() => getAuth()),
     // Specify the default database ID explicitly with the app instance to resolve strictly-routed CORS checks on the client SDK
     provideFirestore(() => {
        const app = initializeApp(firebaseConfig);
        return getFirestore(app, '(default)');
     }),
  ],
};
