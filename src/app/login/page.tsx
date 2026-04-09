
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
import { useAuth, useUser } from '@/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/icons';
import { FirebaseError } from 'firebase/app';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

// Validation helpers
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const MIN_PASSWORD_LENGTH = 6;

// Firebase error messages in Spanish
const getFirebaseErrorMessage = (code: string): string => {
  const errorMessages: Record<string, string> = {
    'auth/email-already-in-use': 'Este correo electrónico ya está registrado.',
    'auth/invalid-email': 'El formato del correo electrónico no es válido.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/user-not-found': 'No existe una cuenta con este correo electrónico.',
    'auth/wrong-password': 'La contraseña es incorrecta.',
    'auth/invalid-credential': 'Las credenciales proporcionadas no son válidas.',
    'auth/too-many-requests': 'Demasiados intentos fallidos. Intente de nuevo más tarde.',
    'auth/network-request-failed': 'Error de conexión. Verifique su conexión a internet.',
    'auth/user-disabled': 'Esta cuenta de usuario ha sido deshabilitada por un administrador.',
  };
  return errorMessages[code] || 'Ha ocurrido un error de autenticación.';
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [isSigningIn, setIsSigningIn] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Email validation
    if (!email.trim()) {
      newErrors.email = 'El correo electrónico es requerido.';
    } else if (!isValidEmail(email)) {
      newErrors.email = 'Ingrese un correo electrónico válido.';
    }

    // Password validation
    if (!password) {
      newErrors.password = 'La contraseña es requerida.';
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      newErrors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }

    // Sign-up specific validations
    if (!isSigningIn) {
      if (!fullName.trim()) {
        newErrors.fullName = 'El nombre completo es requerido.';
      } else if (fullName.trim().length < 2) {
        newErrors.fullName = 'El nombre debe tener al menos 2 caracteres.';
      }

      if (!department.trim()) {
        newErrors.department = 'El departamento es requerido.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth || !firestore) return;

    // Validate form before submitting
    if (!validateForm()) {
      toast({
        variant: "destructive",
        title: "Formulario incompleto",
        description: "Por favor, corrija los errores en el formulario.",
      });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

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
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          department: department.trim(),
          role: 'Member', // Default role
          status: 'active', // Default status
        };

        const userDocRef = doc(firestore, 'users', newUser.uid);

        await setDoc(userDocRef, userProfile, { merge: true });

        toast({
          title: "Cuenta creada",
          description: "Tu cuenta ha sido creada exitosamente.",
        });
        // onAuthStateChanged will handle redirection after profile creation is confirmed.
      }
    } catch (error) {
      if (error instanceof FirebaseError) {
        toast({
          variant: "destructive",
          title: "Error de autenticación",
          description: getFirebaseErrorMessage(error.code),
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Ha ocurrido un error inesperado.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth) return;
    if (!resetEmail.trim() || !isValidEmail(resetEmail)) {
      toast({
        variant: "destructive",
        title: "Correo inválido",
        description: "Ingrese un correo electrónico válido.",
      });
      return;
    }

    setIsResetSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      toast({
        title: "Correo enviado",
        description: "Se ha enviado un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada.",
      });
      setIsResettingPassword(false);
      setResetEmail('');
    } catch (error) {
      if (error instanceof FirebaseError) {
        toast({
          variant: "destructive",
          title: "Error",
          description: getFirebaseErrorMessage(error.code),
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo enviar el correo de restablecimiento.",
        });
      }
    } finally {
      setIsResetSubmitting(false);
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
        <h2 className="text-xl font-bold tracking-tight">STUFFACTORY</h2>
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
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={isSubmitting}
                    aria-invalid={!!errors.fullName}
                    aria-describedby={errors.fullName ? "fullName-error" : undefined}
                    className={errors.fullName ? "border-destructive" : ""}
                  />
                  {errors.fullName && (
                    <p id="fullName-error" className="text-sm text-destructive">{errors.fullName}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="department">Departamento</Label>
                  <Input
                    id="department"
                    type="text"
                    placeholder="p. ej. Ventas"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={isSubmitting}
                    aria-invalid={!!errors.department}
                    aria-describedby={errors.department ? "department-error" : undefined}
                    className={errors.department ? "border-destructive" : ""}
                  />
                  {errors.department && (
                    <p id="department-error" className="text-sm text-destructive">{errors.department}</p>
                  )}
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nombre@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                {isSigningIn && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs text-muted-foreground"
                    onClick={() => {
                      setResetEmail(email);
                      setIsResettingPassword(true);
                    }}
                  >
                    ¿Olvidaste tu contraseña?
                  </Button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder={isSigningIn ? "" : "Mínimo 6 caracteres"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                className={errors.password ? "border-destructive" : ""}
              />
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            {/* Password Reset Inline */}
            {isResettingPassword && (
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <p className="text-sm font-medium">Restablecer contraseña</p>
                <p className="text-xs text-muted-foreground">
                  Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
                </p>
                <Input
                  type="email"
                  placeholder="nombre@ejemplo.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={isResetSubmitting}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handlePasswordReset}
                    disabled={isResetSubmitting}
                  >
                    {isResetSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Enviar enlace
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsResettingPassword(false)}
                    disabled={isResetSubmitting}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSigningIn ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </Button>
          </CardFooter>
        </form>
        <div className="hidden pb-4 text-center text-sm">
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
