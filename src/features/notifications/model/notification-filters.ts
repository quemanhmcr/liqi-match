export const notificationFilters = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'set-invite', label: 'Mời set' },
  { id: 'system', label: 'Hệ thống' },
  { id: 'interaction', label: 'Tương tác' },
] as const;

export type NotificationFilterId = (typeof notificationFilters)[number]['id'];
