# 🚀 Guía de Publicación y Despliegue en la Nube — TJA BCS

Esta guía describe cómo publicar el **Sistema de Gestión de Expedientes del Tribunal de Justicia Administrativa de Baja California Sur** en la nube (Render / Railway / GitHub) para que los solicitantes y evaluadores puedan acceder y testear la aplicación desde cualquier navegador.

---

## 📋 Resumen del Entorno Preparado

| Componente | Tecnología | Configuración de Producción |
| :--- | :--- | :--- |
| **Frontend** | Astro 5 (Node Standalone) + React 19 + Tailwind | `frontend/Dockerfile`, `render.yaml`, puerto `4321` |
| **Backend** | Express + Prisma + SQLite | `backend/Dockerfile`, `render.yaml`, puerto `3001` |
| **Infraestructura** | Render Blueprint / Docker Compose / Monorepo | `render.yaml`, `docker-compose.yml`, `package.json` |

---

## Opción 1: Despliegue en Render (Recomendado — Automatizado con Blueprint)

Render permite alojar tanto el Frontend como el Backend de forma gratuita/económica con certificados SSL (HTTPS) automáticos.

### 1. Subir el proyecto a tu repositorio de GitHub
Ejecuta en la terminal de tu máquina:

```bash
git add .
git commit -m "feat: configuracion lista para despliegue de produccion"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/tja-bcs-app.git
git push -u origin main
```
*(Reemplaza `TU_USUARIO/tja-bcs-app` con el repositorio que crees en GitHub).*

### 2. Crear los servicios en Render en 1 solo clic
1. Entra a [dashboard.render.com](https://dashboard.render.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en el botón azul **New +** en la esquina superior derecha y selecciona **Blueprint**.
3. Selecciona tu repositorio recién subido (`tja-bcs-app`).
4. Render detectará automáticamente el archivo [`render.yaml`](./render.yaml) y creará:
   - **`tja-bcs-backend`**: La API REST con la base de datos de expedientes y autenticación.
   - **`tja-bcs-frontend`**: La aplicación web accesible para los usuarios, conectada a la API.
5. Haz clic en **Apply**.
6. En 2-3 minutos tendrás dos enlaces públicos HTTPS (por ejemplo `https://tja-bcs-frontend.onrender.com`), que es la URL que compartirás con los evaluadores.

---

## Opción 2: Despliegue en Railway

1. Entra a [railway.app](https://railway.app) e inicia sesión con GitHub.
2. Selecciona **New Project** → **Deploy from GitHub repo** y elige tu repositorio.
3. Railway desplegará el backend y frontend utilizando los `Dockerfile` o los scripts definidos en el `package.json`.
4. En la configuración de red (*Settings* → *Networking*), genera un dominio público (*Generate Domain*).

---

## 👥 Credenciales de Prueba para los Solicitantes

Comparte esta lista de usuarios con los directivos y evaluadores para que puedan probar los diferentes niveles de acceso y la experiencia de usuario:

| Rol | Correo Electrónico | Contraseña (ambas funcionan) | Capacidades a Testear |
| :--- | :--- | :--- | :--- |
| **Administrador General** | `admin@tjabcs.gob.mx` | `password123` o `admin123` | Control total, gestión de roles y permisos granulares, suplantación de identidad ("Ver como"), configuración global. |
| **Secretario de Acuerdos** | `secretario1@tjabcs.gob.mx` | `password123` o `secretario123` | Creación y edición de expedientes, cambio de estatus procesales, carga de notas y acuerdos. |
| **Magistrado / Sala** | `magistrado1@tjabcs.gob.mx` | `password123` | Consulta de expedientes de su sala, agenda judicial de audiencias. |
| **Consulta / Dirección** | `consulta@tjabcs.gob.mx` | `password123` o `consulta123` | Modo solo lectura: Dashboard analítico, reportes estadísticos, vista de expedientes (bloqueada la edición y administración de roles). |

> [!NOTE]
> - **URL de la Aplicación (Frontend)**: Es donde los usuarios interactúan visualmente (ej. `https://tja-bcs-frontend.onrender.com`).
> - **URL de la API (Backend)**: Al abrir directamente `https://tja-bcs-backend.onrender.com/` en un navegador, mostrará un JSON de diagnóstico `{ "status": "online", "servicio": "API del Tribunal..." }` confirmando que la API está viva.
> - **Primer Inicio (Cold Start en Render)**: En el plan gratuito de Render, los servidores se suspenden tras 15 minutos sin uso. La primera petición puede tardar entre 30 y 45 segundos en despertar. Las peticiones subsecuentes responderán de inmediato.

---

## 🧪 Puntos Clave que los Solicitantes Pueden Evaluar

1. **Navegación Fluida (View Transitions)**: El sidebar y header se mantienen fijos sin parpadeos mientras el contenido principal transiciona suavemente.
2. **Modo Claro / Modo Oscuro**: El conmutador de tema adapta completamente todas las pantallas, formularios, calendarios y tablas.
3. **Vistas de Expedientes**: Cambio dinámico e instantáneo entre **Tabla**, **Kanban** y **Calendario**.
4. **Paleta y Accesibilidad**: Ajustes de densidad, colores de identificación por empleado y soporte para reducción de movimiento.
5. **Buscador Global**: Acceso inmediato con el atajo de teclado `Ctrl + K`.
