import {
  AlignLeft, AtSign, CalendarDays, ChevronDownSquare, CircleDollarSign, CircleDot, Hash, Link, ListChecks, MapPin, Paperclip, Phone, Pilcrow,
  SeparatorHorizontal, ToggleRight, Type, type LucideIcon,
} from 'lucide-react';
import type { FieldType } from '../forms/types';

export const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  section: SeparatorHorizontal,
  content: AlignLeft,
  short_text: Type,
  long_text: Pilcrow,
  email: AtSign,
  phone: Phone,
  url: Link,
  number: Hash,
  currency: CircleDollarSign,
  date: CalendarDays,
  single_choice: CircleDot,
  multiple_choice: ListChecks,
  dropdown: ChevronDownSquare,
  yes_no: ToggleRight,
  file: Paperclip,
  address: MapPin,
};

export function FieldIcon({ type, className }: { type: FieldType; className?: string }) {
  const Icon = FIELD_ICONS[type] ?? Type;
  return <Icon className={className} aria-hidden />;
}
