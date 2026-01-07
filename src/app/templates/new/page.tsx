import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Draggabledots, GripVertical, Move, PlusCircle } from "lucide-react";
import Link from "next/link";

export default function NewTemplatePage() {
  return (
    <div className="flex flex-1 flex-col">
       <header className="flex items-center justify-between p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight">Create New Template</h1>
        <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/templates">Cancel</Link></Button>
            <Button>Save Template</Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="template-name">Template Name</Label>
                <Input id="template-name" placeholder="e.g., Purchase Order" />
              </div>
              <div>
                <Label htmlFor="template-description">Description</Label>
                <Textarea id="template-description" placeholder="A brief description of what this workflow is for." />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Fields Designer */}
          <Card>
            <CardHeader>
              <CardTitle>Form Fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Define the data to be collected. (This is a static mock-up of a drag-and-drop interface).
              </p>
              <div className="space-y-2 rounded-md border p-4">
                <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 font-medium">Start Date (Date)</div>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 font-medium">Reason (Text Area)</div>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Field
              </Button>
            </CardContent>
          </Card>

          {/* Steps Designer */}
          <Card>
            <CardHeader>
              <CardTitle>Workflow Steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Define the approval or action stages for this workflow.
              </p>
              <div className="space-y-2 rounded-md border p-4">
                <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 font-medium">Manager Approval</div>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 font-medium">HR Confirmation</div>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Step
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
