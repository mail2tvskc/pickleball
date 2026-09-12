# Firebase Setup

The public board is `index.html`; the admin scorer is `admin.html`.

## 1. Create Firebase Project

1. Go to <https://console.firebase.google.com/>.
2. Create a project.
3. Add a Web App.
4. Copy the Firebase config object.
5. Paste the values into `firebase-config.js`.

The Firebase config is safe to publish. It identifies the project; security comes from Firestore rules and Firebase Auth.

## 2. Enable Firestore

1. In Firebase Console, open `Firestore Database`.
2. Create a database.
3. Start in production mode.
4. Use a nearby region.

## 3. Enable Admin Login

1. Open `Authentication`.
2. Enable `Email/Password`.
3. Add one admin user.

## 4. Firestore Rules

Replace Firestore rules with this, using your admin email:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /tournaments/{tournamentId} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.email == "YOUR_ADMIN_EMAIL@example.com";
    }
  }
}
```

## 5. Use The Site

- Public board: `https://mail2tvskc.github.io/pickleball/`
- Admin scorer: `https://mail2tvskc.github.io/pickleball/admin.html`

The public page listens for live Firestore updates. The admin page signs in with Firebase Auth and saves scores to Firestore.
