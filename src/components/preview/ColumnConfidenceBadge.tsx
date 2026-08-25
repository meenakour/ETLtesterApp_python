import { Badge } from '@/components/common/Badge';
import { confidenceLevel } from '@/lib/excel/columnDetection';

export function ColumnConfidenceBadge({ confidence, matched }: { confidence: number; matched: boolean }) {
  if (!matched) return <Badge tone="danger">Unmatched</Badge>;
  const level = confidenceLevel(confidence);
  if (level === 'high') return <Badge tone="success">Auto-detected</Badge>;
  if (level === 'medium') return <Badge tone="warning">Tentative</Badge>;
  return <Badge tone="danger">Low confidence</Badge>;
}
