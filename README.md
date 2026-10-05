# Wins Institute — O/L Commerce Firebase Portal

This is the Replit-independent Firebase edition of the Wins Institute O/L Commerce portal.

## Included
- Firebase Email/Password authentication
- Google authentication
- Student profile setup and editing
- Paper submission with Firebase Storage
- Teacher paper review and marking
- Marks and average percentages
- Automatic class ranking
- Teacher announcements
- Student status management
- Private Storage/Firestore rules
- Firebase Hosting configuration

## Important: set the teacher email
Change `TEACHER_EMAIL` in `src/firebase.ts` and the same email in `firestore.rules` and `storage.rules`.

Then enable Email/Password and Google under Firebase Console → Authentication → Sign-in method.

## Run
1. Install Node.js.
2. Run `npm install`.
3. Run `npm run dev`.
4. For Firebase Hosting, run `npm run build`, then `firebase login` and `firebase deploy`.

The original Replit, Clerk, Express, PostgreSQL/Drizzle, generated API client and `.git` metadata are intentionally not included.

### Teacher setup
The teacher profile is provisioned automatically when the Firebase Authentication email matches the configured teacher email. Keep the same email in `src/firebase.ts`, `firestore.rules`, and `storage.rules`.
