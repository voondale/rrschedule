
# League Schedule Viewer — Firestore persistence

This front-end writes the published schedule to **Cloud Firestore** so all viewers see the same data.

## 1) Enable Firebase + Firestore
1. Create a Firebase project (or use your existing one).
2. Enable **Firestore** in production mode.
3. Copy your web app credentials from **Project settings → General → Your apps (Web)** and paste into `app.js` (the `firebaseConfig` object).

## 2) (Recommended) Security Rules
Open Firestore → Rules and publish one of the options below.

**Option A — Quick demo (read open, write open)**
```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /league/{doc} {
      allow read: if true;
      allow write: if true; // NOT FOR PRODUCTION
    }
  }
}
```

**Option B — Safer (read open, write requires auth)**
Enable Firebase Auth (Email/Password) and sign in as admin before publishing.
```rules
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
Then in your code, sign in with `signInWithEmailAndPassword` before saving.

**Option C — Strict (allow writes only to a specific admin UID)**
```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /league/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid in ["YOUR_ADMIN_UID"];
    }
  }
}
```

> This repo keeps a simple client-side password to toggle the admin UI only. Real write-protection should be implemented with Firestore **Rules** + **Auth** as in Option B/C.

## 3) Run locally
Serve over HTTP (modules + CORS):
```bash
python -m http.server 8000
# then open http://localhost:8000
```

## 4) Admin flow
1. Click **Admin Login** → enter `doubletrouble` (UI only).
2. Choose a JSON file and set a **start date**.
3. Click **Save & Publish** → writes `{ schedule, startDate, updatedAt }` into `league/current`.
4. All viewers load the latest doc on page load; realtime updates are enabled.

