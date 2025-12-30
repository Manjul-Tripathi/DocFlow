import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bell,
  Lock,
  Unlock,
  Clock,
  Shield,
  UserCheck,
  AlertCircle,
  CheckCircle,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { useLockNotifications } from '@/hooks/useLockNotifications';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const notificationIcons = {
  lock_acquired: Lock,
  lock_released: Unlock,
  lock_expired: Clock,
  force_unlock: Shield,
  ownership_transferred: UserCheck,
  access_requested: ExternalLink,
  share_accessed: ExternalLink,
};

const notificationColors = {
  lock_acquired: 'text-blue-500',
  lock_released: 'text-green-500',
  lock_expired: 'text-amber-500',
  force_unlock: 'text-red-500',
  ownership_transferred: 'text-purple-500',
  access_requested: 'text-emerald-500',
  share_accessed: 'text-emerald-500',
};

export function LockNotificationsList() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useLockNotifications();

  // Calculate unread count from notifications array as backup
  const actualUnreadCount = React.useMemo(() =>
    notifications.filter(n => !n.is_read).length,
    [notifications]
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {actualUnreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]"
            >
              {actualUnreadCount > 99 ? '99+' : actualUnreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </span>
            {actualUnreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                Mark all read
              </Button>
            )}
          </SheetTitle>
          <SheetDescription>
            {actualUnreadCount > 0
              ? `You have ${actualUnreadCount} unread notification${actualUnreadCount > 1 ? 's' : ''}`
              : 'No new notifications'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                You'll be notified about document locks and transfers
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const Icon = notificationIcons[notification.notification_type] || FileText;
                const iconColor = notificationColors[notification.notification_type] || 'text-muted-foreground';

                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "p-3 rounded-lg border transition-colors cursor-pointer",
                      notification.is_read
                        ? "bg-background hover:bg-accent"
                        : "bg-primary/5 border-primary/20 hover:bg-primary/10"
                    )}
                    onClick={() => !notification.is_read && markAsRead(notification.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("p-2 rounded-lg bg-background shrink-0", iconColor)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-medium capitalize">
                            {notification.notification_type.replace(/_/g, ' ')}
                          </p>
                          {!notification.is_read && (
                            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {notification.message || 'No message'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
