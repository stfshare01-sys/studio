
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, useUser, setDocumentNonBlocking } from '@/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/icons';
import { FirebaseError } from 'firebase/app';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');

  const [isSigningIn, setIsSigningIn] = useState(true);
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.replace('/');
    }
  }, [user, isUserLoading, router]);

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !firestore) return;

    try {
      if (isSigningIn) {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle redirection
      } else {
        // Create user in Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;

        // Create user profile in Firestore
        const userProfile = {
          id: newUser.uid,
          fullName,
          email,
          department,
          role: 'Member', // Default role
        };
        
        const userDocRef = doc(firestore, 'users', newUser.uid);
        // This is a non-blocking call. We don't wait for it to complete.
        setDocumentNonBlocking(userDocRef, userProfile, { merge: true });

        // onAuthStateChanged will handle redirection
      }
    } catch (error) {
      if (error instanceof FirebaseError) {
        toast({
            variant: "destructive",
            title: "Error de autenticación",
            description: error.message,
        });
      } else {
        toast({
            variant: "destructive",
            title: "Error",
            description: "Ha ocurrido un error inesperado.",
        });
      }
    }
  };

  if (isUserLoading || (!isUserLoading && user)) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
       <div className="absolute top-8 left-8 flex items-center gap-2">
            <Logo className="size-6" />
            <h2 className="text-xl font-semibold tracking-tight">FlowMaster</h2>
        </div>
      <Card className="w-full max-w-sm">
        <form onSubmit={handleAuthAction}>
          <CardHeader>
            <CardTitle className="text-2xl">
              {isSigningIn ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </CardTitle>
            <CardDescription>
              {isSigningIn
                ? 'Introduce tu correo electrónico a continuación para acceder a tu cuenta.'
                : 'Rellene el siguiente formulario para crear una nueva cuenta.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!isSigningIn && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="fullName">Nombre Completo</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="p. ej. Juan Pérez"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="department">Departamento</Label>
                  <Input
                    id="department"
                    type="text"
                    placeholder="p. ej. Ventas"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nombre@ejemplo.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full">
              {isSigningIn ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </Button>
          </CardFooter>
        </form>
        <div className="pb-4 text-center text-sm">
          {isSigningIn ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
          <Button
            variant="link"
            className="p-1"
            onClick={() => setIsSigningIn(!isSigningIn)}
          >
            {isSigningIn ? 'Regístrate' : 'Inicia Sesión'}
          </Button>
        </div>
      </Card>
    </main>
  );
}
