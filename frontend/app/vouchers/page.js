import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function VouchersRedirectPage() {
  const today = new Date().toISOString().slice(0, 10);
  redirect(`/vouchers/${today}`);
}
