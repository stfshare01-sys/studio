
'use client';

import { useState } from 'react';
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
import { useAuth, useUser } from '@/firebase';
import {
  initiateAnonymousSignIn,
  initiateEmailSignIn,
  initiateEmailSignUp,
} from '@/firebase/non-blocking-login';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Logo } from '@/components/icons';
import { FirebaseError } from 'firebase/app';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(true);
  const auth = useAuth();
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
    if (!auth) return;
    try {
      if (isSigningIn) {
        initiateEmailSignIn(auth, email, password);
      } else {
        initiateEmailSignUp(auth, email, password);
      }
    } catch (error) {
      if (error instanceof FirebaseError) {
        toast({
            variant: "destructive",
            title: "Error de autenticación",
            description: error.message,
        });
      }
    }
  };

  const handleAnonymousSignIn = () => {
    if (auth) {
      initiateAnonymousSignIn(auth);
    }
  };

  if (isUserLoading || user) {
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
                : 'Introduce tu correo electrónico y contraseña para crear una cuenta.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
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
            <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                    O continuar con
                    </span>
                </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleAnonymousSignIn}
            >
              Inicio de sesión anónimo
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
