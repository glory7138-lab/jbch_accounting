import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function WeeklyOfferingRedirectPage() {
  const today = new Date().toISOString().slice(0, 10);
  redirect(`/offerings/weekly/${today}`);
}
