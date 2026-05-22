'use client';

import SectionTabs from './SectionTabs';
import { settlementMenuItems } from '../lib/appMenus';

export default function SettlementTabs() {
  return <SectionTabs title="월말결산" items={settlementMenuItems} />;
}
