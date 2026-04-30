"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useFirestore } from "@/firebase"
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import type { MasterList, MasterListField } from "@/types/common.types";

interface RecordFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    listId: string
    listDef: MasterList
    record?: Record<string, any> | null  // null for new, object for edit
}

export function RecordFormDialog({
    open,
    onOpenChange,
    listId,
    listDef,
    record
}: RecordFormDialogProps) {
    const firestore = useFirestore()
    const { toast } = useToast()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formData, setFormData] = useState<Record<string, any>>({})

    const isEditing = !!record

    // Initialize form data when dialog opens or record changes
    useEffect(() => {
        if (open) {
            if (record) {
                // Edit mode: populate with existing data
                const initialData: Record<string, any> = {}
                listDef.fields.forEach(field => {
                    initialData[field.id] = record[field.id] ?? getDefaultValue(field.type)
                })
                setFormData(initialData)
            } else {
                // Add mode: set default values
                const initialData: Record<string, any> = {}
                listDef.fields.forEach(field => {
                    initialData[field.id] = getDefaultValue(field.type)
                })
                setFormData(initialData)
            }
        }
    }, [open, record, listDef.fields])

    const getDefaultValue = (type: MasterListField['type']) => {
        switch (type) {
            case 'text': return ''
            case 'number': return ''
            case 'boolean': return false
            case 'date': return ''
            default: return ''
        }
    }

    const handleFieldChange = (fieldId: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [fieldId]: value
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!firestore) return

        setIsSubmitting(true)

        try {
            // Prepare data with proper types
            const dataToSave: Record<string, any> = {}
            listDef.fields.forEach(field => {
                let value = formData[field.id]

                // Convert types as needed
                switch (field.type) {
                    case 'number':
                        dataToSave[field.id] = value === '' ? null : Number(value)
                        break
                    case 'boolean':
                        dataToSave[field.id] = Boolean(value)
                        break
                    case 'date':
                        dataToSave[field.id] = value || null
                        break
                    default:
                        dataToSave[field.id] = value || ''
                }
            })

            if (isEditing && record?.id) {
                // Update existing record
                const recordRef = doc(firestore, 'master_data', listId, 'records', record.id)
                await updateDoc(recordRef, {
                    ...dataToSave,
                    updatedAt: serverTimestamp()
                })
                toast({
                    title: "Registro actualizado",
                    description: "El registro ha sido actualizado correctamente."
                })
            } else {
                // Add new record
                const recordsRef = collection(firestore, 'master_data', listId, 'records')
                await addDoc(recordsRef, {
                    ...dataToSave,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                })
                toast({
                    title: "Registro creado",
                    description: "El registro ha sido creado correctamente."
                })
            }

            onOpenChange(false)
        } catch (error) {
            console.error("Error saving record:", error)
            toast({
                title: "Error",
                description: "No se pudo guardar el registro. Intente nuevamente.",
                variant: "destructive"
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const renderField = (field: MasterListField) => {
        const value = formData[field.id]

        switch (field.type) {
            case 'boolean':
                return (
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id={field.id}
                            checked={value === true}
                            onCheckedChange={(checked) => handleFieldChange(field.id, checked)}
                        />
                        <Label htmlFor={field.id} className="text-sm font-normal">
                            {field.label}
                        </Label>
                    </div>
                )

            case 'number':
                return (
                    <div className="space-y-2">
                        <Label htmlFor={field.id}>{field.label}</Label>
                        <Input
                            id={field.id}
                            type="number"
                            value={value}
                            onChange={(e) => handleFieldChange(field.id, e.target.value)}
                            placeholder={`Ingrese ${field.label.toLowerCase()}`}
                        />
                    </div>
                )

            case 'date':
                return (
                    <div className="space-y-2">
                        <Label htmlFor={field.id}>{field.label}</Label>
                        <Input
                            id={field.id}
                            type="date"
                            value={value}
                            onChange={(e) => handleFieldChange(field.id, e.target.value)}
                        />
                    </div>
                )

            case 'text':
            default:
                return (
                    <div className="space-y-2">
                        <Label htmlFor={field.id}>{field.label}</Label>
                        <Input
                            id={field.id}
                            type="text"
                            value={value}
                            onChange={(e) => handleFieldChange(field.id, e.target.value)}
                            placeholder={`Ingrese ${field.label.toLowerCase()}`}
                        />
                    </div>
                )
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing ? 'Editar Registro' : 'Nuevo Registro'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? 'Modifique los campos del registro.'
                            : `Añada un nuevo registro a la lista "${listDef.name}".`
                        }
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                        {listDef.fields.map((field) => (
                            <div key={field.id}>
                                {renderField(field)}
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isEditing ? 'Guardar cambios' : 'Crear registro'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
