"use client";

import { useState } from "react";
import { Bell, Check, Trash2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, orderBy, limit, where, doc } from "firebase/firestore";
import { updateDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase/non-blocking-updates";

export type Notification = {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "task";
  read: boolean;
  createdAt: string;
  link?: string;
};

export function NotificationCenter() {
  const firestore = useFirestore();
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  const notificationsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
  }, [firestore, user?.uid]);

  const { data: notifications } = useCollection<Notification>(notificationsQuery);

  const unreadCount = notifications?.filter(n => !n.read).length ?? 0;

  const markAsRead = (notificationId: string) => {
    if (!firestore || !user?.uid) return;
    const notifRef = doc(firestore, 'users', user.uid, 'notifications', notificationId);
    updateDocumentNonBlocking(notifRef, { read: true });
  };

  const markAllAsRead = () => {
    if (!firestore || !user?.uid || !notifications) return;
    notifications.filter(n => !n.read).forEach(n => {
      const notifRef = doc(firestore, 'users', user.uid, 'notifications', n.id);
      updateDocumentNonBlocking(notifRef, { read: true });
    });
  };

  const deleteNotification = (notificationId: string) => {
    if (!firestore || !user?.uid) return;
    const notifRef = doc(firestore, 'users', user.uid, 'notifications', notificationId);
    deleteDocumentNonBlocking(notifRef);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "success": return "✅";
      case "warning": return "⚠️";
      case "task": return "📋";
      default: return "ℹ️";
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notificaciones</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-4 py-2">
          <DropdownMenuLabel className="p-0">Notificaciones</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs"
              onClick={(e) => {
                e.preventDefault();
                markAllAsRead();
              }}
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Marcar todo leído
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {!notifications || notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No hay notificaciones</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors ${
                  !notification.read ? 'bg-muted/30' : ''
                }`}
              >
                <span className="text-lg">{getTypeIcon(notification.type)}</span>
                <div className="flex-1 space-y-1">
                  <p className={`text-sm leading-tight ${!notification.read ? 'font-medium' : ''}`}>
                    {notification.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                      locale: es
                    })}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.preventDefault();
                        markAsRead(notification.id);
                      }}
                    >
                      <Check className="h-3 w-3" />
                      <span className="sr-only">Marcar como leído</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      deleteNotification(notification.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                    <span className="sr-only">Eliminar</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
