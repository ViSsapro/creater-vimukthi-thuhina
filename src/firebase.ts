import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBXWGA5kBY0qhmkL-wKZJ16VCjKsZM-4Gg",
  authDomain: "commerce-with-damith-manage.firebaseapp.com",
  projectId: "commerce-with-damith-manage",
  storageBucket: "commerce-with-damith-manage.firebasestorage.app",
  messagingSenderId: "646197742634",
  appId: "1:646197742634:web:0d4d69112babfba61d0753",
  measurementId: "G-DLSWTPW732",
};

// Change only this email to the teacher's Firebase Authentication email.
// Students can never promote themselves to teacher through the client UI.
export const TEACHER_EMAIL = "vimukthithuhina754@gmail.com";
export const CREATOR_NAME = "Vimukthi Thuhina";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch(() => {});
