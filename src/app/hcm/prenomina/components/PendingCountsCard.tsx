'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Clock, UserX } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '../utils/prenomina-utils';

interface PendingCounts {
    tardiness: number;
    departures: number;
    overtime: number;
    missingPunches: number;
}

interface ManagerReview {
    id: string;
    periodStart: string;
    periodEnd: string;
    managerId: string;
    managerName: string;
    status: string;
    reviewedAt?: string;
}

interface PendingCountsCardProps {
    pendingCounts: PendingCounts;
    managerReviews: ManagerReview[];
    totalPending: number;
    isPeriodClosed: boolean;
    loadingPending: boolean;
}

export function PendingCountsCard({
    pendingCounts,
    managerReviews,
    totalPending,
    isPeriodClosed,
    loadingPending,
}: PendingCountsCardProps) {
    if (loadingPending) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Pendientes por justificar</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[...Array(4)].map((_, i) => (
                            <Skeleton key={i} className="h-16 rounded-lg" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    const items = [
        { label: 'Retardos', count: pendingCounts.tardiness, icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
        { label: 'Salidas anticipadas', count: pendingCounts.departures, icon: UserX, color: 'text-orange-600 bg-orange-50' },
        { label: 'Tiempo extra', count: pendingCounts.overtime, icon: Clock, color: 'text-blue-600 bg-blue-50' },
        { label: 'Marcaje faltante', count: pendingCounts.missingPunches, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    ];

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Pendientes por justificar</CardTitle>
                    {totalPending === 0 ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Sin pendientes
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {totalPending} pendiente{totalPending !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {items.map(({ label, count, icon: Icon, color }) => (
                        <div key={label} className={`flex items-center gap-3 rounded-lg p-3 ${color}`}>
                            <Icon className="h-4 w-4 shrink-0" />
                            <div>
                                <p className="text-xs font-medium leading-none">{label}</p>
                                <p className="text-lg font-bold">{count}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {managerReviews.length > 0 && (
                    <div className="border-t pt-3 space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Revisiones de managers</p>
                        {managerReviews.map(review => (
                            <div key={review.id} className="flex items-center justify-between text-xs">
                                <span className="text-foreground">{review.managerName}</span>
                                <span className={`font-medium ${review.status === 'completed' ? 'text-green-600' : 'text-amber-600'}`}>
                                    {review.status === 'completed'
                                        ? `Completado ${review.reviewedAt ? formatDate(review.reviewedAt.substring(0, 10)) : ''}`
                                        : 'Pendiente'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {isPeriodClosed && (
                    <p className="text-xs text-muted-foreground italic">
                        El período está cerrado — los pendientes mostrados son informativos.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
