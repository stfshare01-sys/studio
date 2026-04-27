/**
 * API Route: /api/ai/biblioteca
 * Módulo: Biblioteca — Endpoint del bot RAG
 *
 * Valida autenticación del usuario via Firebase Auth token,
 * obtiene el perfil del empleado para saber su departamento,
 * y ejecuta el flujo Genkit de RAG.
 *
 * POST /api/ai/biblioteca
 * Body: { question: string, categories?: string[] }
 * Headers: Authorization: Bearer <Firebase ID token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { bibliotecaRagFlow } from '@/ai/flows/biblioteca-rag';

// Forzar ruta dinámica para evitar que Next.js intente pre-renderizarla en el build
export const dynamic = 'force-dynamic';

// Inicializar Firebase Admin si no está inicializado
if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    console.warn('[Firebase Admin] Skipping initialization due to missing credentials (likely build phase)');
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verificar token de Firebase Auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 });
    }

    const userId = decodedToken.uid;

    // 2. Obtener departamento del empleado desde Firestore
    const db = getFirestore();
    const employeeDoc = await db.collection('employees').doc(userId).get();
    const userDepartment = employeeDoc.exists
      ? (employeeDoc.data()?.department as string | undefined)
      : undefined;

    // 3. Parsear body de la petición
    const body = await req.json() as { question?: string; categories?: string[] };
    const { question, categories } = body;

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return NextResponse.json(
        { error: 'La pregunta debe tener al menos 3 caracteres' },
        { status: 400 }
      );
    }

    // 4. Ejecutar flujo RAG
    const result = await bibliotecaRagFlow({
      question: question.trim(),
      userId,
      userDepartment,
      categories,
    });

    return NextResponse.json(result, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('[Biblioteca API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
