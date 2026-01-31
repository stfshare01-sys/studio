
"use client";

import { useEffect, useState } from "react";
import { useFirebase } from "@/firebase/provider";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";
import { Bell, Check, Trash2, CheckCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import type { Notification } from "@/lib/types";

export function NotificationCenter() {
  const { firestore, user } = useFirebase();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!firestore || !user) return;

    // Listen to meaningful notifications for the current user
    const q = query(
      collection(firestore, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];

      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    });

    return () => unsubscribe();
  }, [firestore, user]);

  const markAsRead = async (notificationId: string) => {
    if (!firestore || !user) return;
    try {
      await updateDoc(doc(firestore, "users", user.uid, "notifications", notificationId), {
        read: true,
        readAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!firestore || !user || notifications.length === 0) return;

    const unreadNotifications = notifications.filter(n => !n.read);
    const batch = writeBatch(firestore);

    unreadNotifications.forEach(n => {
      const ref = doc(firestore, "users", user.uid, "notifications", n.id);
      batch.update(ref, {
        read: true,
        readAt: new Date().toISOString()
      });
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
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
        <Button variant="ghost" size="icon" className="relative text-gray-400 hover:text-white hover:bg-white/10">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-gray-900" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel className="flex items-center justify-between font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">Notificaciones</p>
            <p className="text-xs text-muted-foreground">{unreadCount} sin leer</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-auto px-2 py-1 text-xs">
              <CheckCheck className="mr-1 h-3 w-3" />
              Marcar todo
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No tienes notificaciones
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-1">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex flex-col gap-1 rounded-md p-3 text-sm transition-colors hover:bg-muted/50 ${!notification.read ? "bg-muted/20 border-l-2 border-primary" : ""}`}
                  onClick={() => !notification.read && markAsRead(notification.id)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-lg">{getTypeIcon(notification.type)}</span>
                    <div className="flex-1">
                      <span className="font-medium text-foreground block">{notification.title}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap block">
                        {formatDistanceToNow(new Date(notification.createdAt), { locale: es, addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <p className="text-muted-foreground leading-snug ml-7">{notification.message}</p>
                  {notification.link && (
                    <div className="ml-7 pt-1">
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                        <Link href={notification.link}>Ver detalle</Link>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
