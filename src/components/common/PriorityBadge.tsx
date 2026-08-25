import type { Priority } from '@/types/testCase';
import { PRIORITY_LABELS } from '@/types/testCase';
import { Badge } from '@/components/common/Badge';

const PRIORITY_TONE = {
  P1: 'danger',
  P2: 'warning',
  P3: 'neutral',
} as const;

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}
