import { UseFormReturn } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { EmployeeFormValues } from '../employee-schema';

interface LegalInfoCardProps {
    form: UseFormReturn<EmployeeFormValues>;
}

export function LegalInfoCard({ form }: LegalInfoCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Información Legal y Fiscal</CardTitle>
                <CardDescription>Datos requeridos por el SAT e IMSS</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <FormField
                    control={form.control}
                    name="rfc"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>RFC</FormLabel>
                            <FormControl>
                                <Input placeholder="XAXX010101000" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="curp"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>CURP</FormLabel>
                            <FormControl>
                                <Input placeholder="18 Caracteres" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="nss"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>NSS (IMSS)</FormLabel>
                            <FormControl>
                                <Input placeholder="11 Dígitos" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
    );
}
