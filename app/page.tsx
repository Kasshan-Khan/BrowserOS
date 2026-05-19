import { redirect } from 'next/navigation';

// Root page — middleware handles redirect to /login or /desktop
// This is a fallback in case middleware doesn't fire
export default function RootPage() {
  redirect('/login');
}
