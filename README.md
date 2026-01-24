
# League Schedule Viewer — Firestore (Option B)

This version persists the schedule to Firestore, and **only authenticated users can write** (Option B Rules). Everyone can read.

## 1) Firebase setup
- Create a Firebase project, enable **Firestore**.
- Enable **Authentication → Sign-in method → Email/Password**.
- Add at least one admin user (Email/Password) under **Authentication → Users**.
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
- Click **Sign in** → enter the admin email + password you created in Firebase.
- Upload JSON, set **start date**, click **Save & Publish**.
- The document `league/current` is written and all viewers load it on open (and via realtime updates).

## 5) Notes
- If you prefer to limit writes to a specific UID, switch to Option C in Rules.
- For a branded sign-in form instead of prompts, I can add a small modal or FirebaseUI widget.
