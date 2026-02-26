import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyB_YelqOdjbcUjbvX7hGivMqzZIwoGsIsw",
    authDomain: "ieee-its-b6c77.firebaseapp.com",
    projectId: "ieee-its-b6c77",
    storageBucket: "ieee-its-b6c77.firebasestorage.app",
    messagingSenderId: "152204483958",
    appId: "1:152204483958:web:09fd78f110a3bdaace6e57"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
