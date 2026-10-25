import { redirect } from 'next/navigation';

// Sign-up and sign-in are the same flow now: Google sign-in creates the account
// on first use. Kept as a redirect so old links and bookmarks still work.
export default function SignUpPage() {
  redirect('/sign-in');
}
