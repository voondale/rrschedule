
# League Schedule Viewer — Firestore (Option B)

This build persists the schedule to Firestore. **Everyone can read**, and **only authenticated users can write**.

## 1) Firebase setup
- Create a Firebase project, enable **Firestore**.
- Enable **Authentication → Sign-in method → Email/Password**.
- Create at least one admin user under **Authentication → Users**.
- Paste your web app config into `app.js` (the `firebaseConfig` object).

## 2) Firestore Security Rules (Option B)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /league/{doc} {
      allow read: if true;
      allow write: if request.auth != null; // require signed-in user
    }
  }
}
```
Publish these in the Firebase console.

## 3) Run locally
Serve with any static server (modules require http):
```bash
python -m http.server 8000
# open http://localhost:8000
```

## 4) Admin flow
- Click **Sign in** → enter the admin email + password (from Firebase Auth Users).
- Upload JSON, set **start date**, click **Save & Publish**.
- The document `league/current` is written and all viewers load it on open (and via realtime updates).

## 5) Notes
- If you prefer to limit writes to a specific UID, change the Rules to Option C.
- If your Sign-in click shows a message that the app is still loading, hard-refresh (Ctrl+F5) or ensure you are serving over HTTP.
