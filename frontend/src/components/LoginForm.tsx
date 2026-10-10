/**
 * TJA BCS - Interactive Login Form Component
 * File path: frontend/src/components/LoginForm.tsx
 *
 * Interactive React island for authentication:
 * - Controlled inputs for email and password.
 * - Password visibility toggle.
 * - Loading indicator during submission.
 * - Accessible error notification alert.
 * - Quick-fill credentials for system test roles (Admin, Magistrado, Secretario, Consulta).
 * - Dual-layer session storage via `setSession` (cookie + localStorage).
 * - Safe redirect respecting query param (?redirect=/...).
 */

import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, UserCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { setSession } from '../lib/auth';

interface LoginResponse {
  token: string;
  usuario: {
    id: number;
    nombre: string;
    correo: string;
    rol: string;
    rolId: number;
    salaId: number | null;
    permisos: string[];
  };
  user?: any;
  permisos: string[];
  isImpersonated?: boolean;
  originalAdmin?: {
    id: number;
    nombre: string;
    correo?: string;
  } | null;
}

const TEST_ACCOUNTS = [
  { rol: 'Admin', email: 'admin@tjabcs.gob.mx', pass: 'password123', label: 'Admin Global' },
  { rol: 'Magistrado', email: 'magistrado1@tjabcs.gob.mx', pass: 'password123', label: 'Magistrado Sala I' },
  { rol: 'Secretario', email: 'secretario1@tjabcs.gob.mx', pass: 'password123', label: 'Secretario Acuerdos' },
  { rol: 'Consulta', email: 'consulta@tjabcs.gob.mx', pass: 'password123', label: 'Consulta / Dirección' },
];

export default function LoginForm() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sanitizes redirect URL to prevent open redirect vulnerabilities.
   */
  const getSafeRedirectUrl = (): string => {
    if (typeof window === 'undefined') return '/';
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');

    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      return redirect;
    }
    return '/';
  };

  /**
   * Form submission handler
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!correo.trim() || !password) {
      setError('Por favor ingrese su correo institucional y contraseña.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await api.post<LoginResponse>(
        '/api/auth/login',
        {
          correo: correo.trim().toLowerCase(),
          password,
        },
        { skipAuth: true }
      );

      if (!data || !data.token) {
        throw new Error('Respuesta del servidor inválida: token no recibido.');
      }

      const activeUser = data.usuario || data.user;
      if (!activeUser) {
        throw new Error('Respuesta del servidor inválida: datos de usuario no recibidos.');
      }

      // Persist session to cookie and localStorage
      setSession(
        data.token,
        activeUser,
        data.originalAdmin || null,
        Boolean(data.isImpersonated)
      );

      // Navigate to destination
      const destination = getSafeRedirectUrl();
      window.location.href = destination;
    } catch (err: any) {
      console.error('[LoginForm] Login failure:', err);

      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Credenciales inválidas. Por favor verifique su correo y contraseña.');
        } else if (err.status === 403) {
          setError('Acceso denegado: El usuario se encuentra inactivo o suspendido.');
        } else {
          setError(err.message || 'Error al autenticar con el tribunal.');
        }
      } else {
        setError(err.message || 'No se pudo conectar con el servidor. Intente más tarde.');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Quick fill credentials for rapid testing
   */
  const handleSelectAccount = (email: string, pass: string) => {
    setCorreo(email);
    setPassword(pass);
    setError(null);
  };

  return (
    <div className="w-full">
      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-3 text-sm animate-in fade-in duration-200"
        >
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Email Field */}
        <div>
          <label htmlFor="correo" className="block text-sm font-medium text-slate-300 mb-2">
            Correo Institucional
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
              <Mail className="h-5 w-5" />
            </div>
            <input
              id="correo"
              name="correo"
              type="email"
              autoComplete="email"
              autoFocus
              required
              disabled={loading}
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="block w-full pl-11 pr-4 py-3 border border-slate-700 rounded-xl leading-5 bg-slate-900/60 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all disabled:opacity-50"
              placeholder="usuario@tjabcs.gob.mx"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
            Contraseña
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
              <Lock className="h-5 w-5" />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full pl-11 pr-11 py-3 border border-slate-700 rounded-xl leading-5 bg-slate-900/60 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all disabled:opacity-50"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-300 focus:outline-none cursor-pointer"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Options Row */}
        <div className="flex items-center justify-between text-sm pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
              className="w-4 h-4 text-blue-600 dark:text-blue-300 focus:ring-blue-500 border-slate-600 rounded bg-slate-800"
            />
            <span>Recordarme</span>
          </label>
          <span className="text-xs text-slate-500 dark:text-slate-400 italic">
            Sesión activa por 24 horas
          </span>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-600/30 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              <span>Verificando credenciales...</span>
            </>
          ) : (
            <span>Iniciar Sesión</span>
          )}
        </button>
      </form>

      {/* Quick Test Accounts Helper */}
      <div className="mt-8 pt-6 border-t border-slate-700/60">
        <p className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5 text-blue-400" />
          <span>Cuentas de prueba rápida (desarrollo):</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {TEST_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => handleSelectAccount(acc.email, acc.pass)}
              className="text-left p-2 rounded-lg bg-slate-900/40 hover:bg-slate-700/50 border border-slate-700/60 transition-colors text-xs text-slate-300 group cursor-pointer"
            >
              <div className="font-semibold text-blue-400 group-hover:text-blue-300">
                {acc.label}
              </div>
              <div className="text-[11px] text-slate-400 truncate">{acc.email}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
