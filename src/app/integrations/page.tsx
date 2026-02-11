
"use client";

import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiIcon, DocusignIcon, GoogleSuiteIcon, JiraIcon, Office365Icon, OracleIcon, SalesforceIcon, SapIcon, SlackIcon, TeamsIcon, TrelloIcon } from "@/components/integrations/connector-icons";

const connectors = [
  {
    name: "SAP",
    description: "Sincronice datos maestros, pedidos y finanzas con su ERP SAP.",
    icon: <SapIcon className="h-8 w-8" />,
  },
  {
    name: "Oracle",
    description: "Integre con Oracle E-Business Suite, JD Edwards o NetSuite.",
    icon: <OracleIcon className="h-8 w-8" />,
  },
  {
    name: "Salesforce",
    description: "Automatice la creación de clientes y casos en su CRM.",
    icon: <SalesforceIcon className="h-8 w-8" />,
  },
  {
    name: "Google Suite",
    description: "Cree documentos, hojas de cálculo y eventos de calendario.",
    icon: <GoogleSuiteIcon className="h-8 w-8" />,
  },
  {
    name: "Office 365",
    description: "Envíe correos, gestione archivos en OneDrive y SharePoint.",
    icon: <Office365Icon className="h-8 w-8" />,
  },
  {
    name: "Slack",
    description: "Envíe notificaciones y aprobaciones directamente a sus canales.",
    icon: <SlackIcon className="h-8 w-8" />,
  },
  {
    name: "Microsoft Teams",
    description: "Colabore y reciba alertas de flujo de trabajo en sus equipos.",
    icon: <TeamsIcon className="h-8 w-8" />,
  },
  {
    name: "Jira",
    description: "Cree y actualice incidencias y tareas de forma automática.",
    icon: <JiraIcon className="h-8 w-8" />,
  },
  {
    name: "Trello",
    description: "Convierta los pasos del flujo de trabajo en tarjetas de Trello.",
    icon: <TrelloIcon className="h-8 w-8" />,
  },
  {
    name: "DocuSign",
    description: "Envíe documentos para su firma electrónica como parte de un proceso.",
    icon: <DocusignIcon className="h-8 w-8" />,
  },
];

export default function IntegrationsPage() {
  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        <header className="p-4 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight">Centro de Integraciones</h1>
          <p className="text-muted-foreground">Conecte STUFFACTORY con las herramientas que ya utiliza para crear flujos de trabajo sin fisuras.</p>
        </header>
        <main className="flex flex-1 flex-col gap-8 p-4 pt-0 sm:p-6 sm:pt-0">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="flex flex-row items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <ApiIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>API para Integraciones Personalizadas</CardTitle>
                <CardDescription>
                  ¿No ve la aplicación que necesita? Utilice nuestra robusta API REST para construir sus propias integraciones con sistemas legados o aplicaciones especializadas.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" disabled>Leer Documentación de la API</Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {connectors.map((connector) => (
              <Card key={connector.name} className="flex flex-col">
                <CardHeader className="flex-row items-center gap-4">
                  {connector.icon}
                  <CardTitle className="text-lg">{connector.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">{connector.description}</p>
                </CardContent>
                <CardContent>
                  <Button className="w-full" disabled>Conectar</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </SiteLayout>
  );
}
