# OpenInfinity

[中文](./README.md) | [English](./README.en.md) | [Español](./README.es.md)

> **OpenInfinity está desarrollado sobre el proyecto MIT [openflipbook](https://github.com/eren23/openflipbook).**  
> Mantiene el modelo original de "imagen como página, clic como navegación y exploración infinita", pero adapta la arquitectura para despliegues en China continental, almacenamiento local y operación más estable — con optimizaciones de rendimiento que reducen la latencia de generación hasta 10×.

OpenInfinity es una solución local-first para exploración visual interactiva y navegación de contenido generado por IA:

- **Frontend**: Next.js 15 App Router
- **Backend**: FastAPI
- **Planificación textual**: DeepSeek
- **Comprensión visual**: Alibaba Cloud DashScope (Qwen-VL-Plus)
- **Generación de imagen**: SiliconFlow (Kolors / Flux, ~3–8 s síncronos) o DashScope Wanx (asíncrono, intercambiable)
- **Imagen a video**: Alibaba Cloud DashScope Wanx i2v
- **Metadatos**: PostgreSQL
- **Persistencia de imágenes**: almacenamiento TTL en archivos locales dentro del proyecto

## Vista previa

| Interfaz de generación y navegación | Interfaz de exploración de nodos |
| --- | --- |
| ![OpenInfinity screenshot 1](./68d2a816-f0c8-4e86-8704-a23d11b731f0.png) | ![OpenInfinity screenshot 2](./f1089dd5-6497-4065-875c-539ceb01f5ad.png) |

## Mejoras de rendimiento

El proyecto ha pasado por múltiples rondas de optimización profunda que reducen drásticamente la latencia clic-a-imagen:

### Generación de imagen 10× más rápida

| Métrica | Antes (DashScope polling asíncrono) | Después (SiliconFlow síncrono) |
| --- | --- | --- |
| Latencia típica de imagen | 20–60 segundos | **3–8 segundos** |
| Rondas de polling | Hasta 80 × 3 s de espera | Ninguna — respuesta síncrona |
| Transferencia de imagen | Descarga → base64 → SSE (~1,4 MB) | URL CDN devuelta; servidor web descarga una vez |

### Eliminación del tránsito base64 en el navegador

```
Antes: backend descarga → codifica base64 → SSE → navegador decodifica → POST de vuelta al servidor
Después: backend devuelve URL CDN → servidor web descarga y guarda → navegador solo consume la URL
```

El navegador queda completamente fuera de la transferencia de imagen, eliminando ~1,4 MB de base64 por generación.

### Flujo de tareas asíncronas en el servidor

- El navegador hace POST y recibe inmediatamente un `jobId`
- Sigue el progreso vía SSE (comprensión → planificación → generación → guardado)
- Toda la persistencia ocurre en el servidor; el navegador solo consume la URL del nodo final
- `sweepExpiredFiles` se mueve fuera de la cadena de peticiones a un Janitor periódico en segundo plano

### Optimización del modelo VLM

- Comprensión de clic cambiada de `qwen-vl-max-latest` a `qwen-vl-plus` (~50% más rápido)
- La localización de clics no requiere el VLM más pesado; el modelo ligero es equivalente

### Otras correcciones de ingeniería

- Corregido TypeError `localStorage.getItem` de Node.js v25 que bloqueaba el servidor de desarrollo de Next.js
- Corregido bloqueo del script `run-local.sh` por curl sin `--max-time` durante la compilación Turbopack
- Eliminadas lecturas duplicadas de base de datos en la hidratación de `/n/[id]` mediante `cache()` de React

## Por qué recomendamos servicios de IA locales

Para despliegues orientados a China continental, se recomienda **DeepSeek + DashScope + SiliconFlow**:

1. **Mejor accesibilidad de red** — sin dependencia de APIs extranjeras ni cadenas de proxy.
2. **Latencia más predecible** — SiliconFlow Kolors/Flux devuelve síncronamente, sin esperar polling.
3. **Ventajas operativas y de cumplimiento** en entornos locales.
4. **Capa gratuita disponible** — SiliconFlow ofrece cuota gratuita generosa; Kolors funciona sin configuración adicional.

## Arquitectura técnica

### Modelo de interacción

1. El usuario introduce un tema y obtiene una imagen explicativa con anotaciones.
2. Hace clic en cualquier región de la imagen.
3. Un modelo visual (Qwen-VL-Plus) interpreta el área seleccionada.
4. Un modelo de planificación (DeepSeek) genera la siguiente página a partir de ese sujeto.
5. Un servicio de imagen (SiliconFlow o DashScope) genera la imagen síncronamente/asíncronamente.
6. El estilo visual se mantiene entre páginas para formar un árbol de exploración compartible.

### Capas del sistema

| Capa | Tecnología | Responsabilidad |
| --- | --- | --- |
| Web | Next.js 15 | Renderizado, interacción, flujo SSE de progreso, persistencia de nodos |
| Backend | FastAPI | Planificación, comprensión del clic, orquestación de generación de imagen |
| Base de datos | PostgreSQL | Nodos, sesiones, grafo padre-hijo, metadatos |
| Almacenamiento | Archivos locales + TTL | Imágenes persistentes con limpieza en segundo plano |

### Decisiones de ingeniería

- **Cola de trabajos en el servidor**: POST devuelve `jobId` al instante; SSE empuja el progreso de cada etapa.
- **Persistencia por URL**: URLs CDN descargadas una vez en el servidor; el navegador no interviene en la transferencia de imágenes.
- **Despacho multi-proveedor**: variable `IMAGE_PROVIDER` cambia entre SiliconFlow (rápido, síncrono) y DashScope (alta calidad, asíncrono).
- **Almacenamiento local de imágenes**: sin OSS / S3 / R2 por defecto.
- **Nodos con permalink** y historial de navegación padre-hijo.
- **Janitor en segundo plano**: el barrido de archivos caducados es completamente asíncrono y nunca bloquea peticiones.
- **Arranque local completo**: `run-local.sh` / `restart.sh` levantan todo el stack sin Docker.

## Pila de IA recomendada

| Capacidad | Proveedor recomendado | Implementación actual |
| --- | --- | --- |
| Planificación textual | DeepSeek | `deepseek-v4-flash` |
| Comprensión visual | DashScope | `qwen-vl-plus` |
| Generación de imagen (rápida) | SiliconFlow | `Kwai-Kolors/Kolors` (~3–5 s) |
| Generación de imagen (calidad) | DashScope Wanx | `wanx2.1-t2i-plus` (~20–60 s) |
| Imagen a video | DashScope Wanx i2v | `wanx2.1-i2v-turbo` |

## Estructura del proyecto

```text
apps/
  backend/   Servicio FastAPI de orquestación de IA
  web/       Sitio Next.js, interacción y APIs de persistencia
docker-compose.yml
run-local.sh   Script de control local completo (inicializar, arrancar, parar, estado)
restart.sh     Reinicio con un solo comando de todos los servicios
```

## Requisitos previos

- Node.js 20+ (recomendado Node.js 22; v25 tiene problemas conocidos de compatibilidad)
- npm
- Python 3.11 / 3.12 / 3.13 (3.14+ no soportado)
- PostgreSQL 16 (`initdb`, `pg_ctl`, `psql`, `createdb` para el script local)

Instalación recomendada en macOS:

```bash
brew install node
brew install python@3.12
brew install postgresql@16
```

## Archivos de entorno

Primero copia las plantillas:

```bash
cp .env.compose.example .env.compose
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
```

Configuración clave en `apps/backend/.env`:

```env
DEEPSEEK_API_KEY=tu_clave_deepseek

# Proveedor de imagen — elige uno:
# Opción 1: SiliconFlow (recomendado — síncrono, ~3-8 s)
IMAGE_PROVIDER=siliconflow
SILICONFLOW_API_KEY=tu_clave_siliconflow   # clave gratuita en siliconflow.cn

# Opción 2: DashScope Wanx (mayor calidad, asíncrono ~20-60 s)
# IMAGE_PROVIDER=dashscope
# DASHSCOPE_API_KEY=tu_clave_dashscope
```

> `NEXT_PUBLIC_SITE_URL` debe ser un dominio público accesible si quieres usar generación de video con DashScope.

## Inicio

### Inicio local con un solo comando (recomendado)

```bash
bash ./run-local.sh
```

El script hace automáticamente: inicializa PostgreSQL → arranca la base de datos → instala dependencias del backend/frontend → arranca FastAPI + Next.js.

URLs por defecto:

- `http://127.0.0.1:3000/play`
- `http://127.0.0.1:3000/status`

### Reinicio con un solo comando

```bash
bash ./restart.sh           # reinicia todos los servicios
bash ./restart.sh --logs    # reinicia y sigue los logs en tiempo real (Ctrl+C sale del seguimiento, los servicios siguen corriendo)
```

### Otros comandos de control

```bash
bash ./run-local.sh stop      # para todos los servicios
bash ./run-local.sh status    # muestra el estado
bash ./run-local.sh clean     # limpia la caché de compilación de Next.js y para el frontend
```

## Inicio local paso a paso

### 1. Preparar PostgreSQL

Crea la base de datos y el usuario, y define `apps/web/.env.local`:

```env
POSTGRES_URL=postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/openflipbook
```

### 2. Iniciar el backend

```bash
cd apps/backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8787
```

### 3. Iniciar el frontend

```bash
cd apps/web
npm install
npm run dev
```

### 4. Abrir la aplicación

```text
http://127.0.0.1:3000/play
```

## Opción adicional: Docker Compose

```bash
cp .env.compose.example .env.compose
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
# Luego completa tus propias claves API y contraseña de base de datos
docker compose up --build
```

## Seguridad y buenas prácticas

- No subas `apps/backend/.env`, `apps/web/.env.local` ni `.env.compose`.
- No subas claves reales, contraseñas, logs ni cachés de imágenes generadas.
- Empieza con la arquitectura local + PostgreSQL y amplía solo cuando sea necesario.

## Reconocimiento

OpenInfinity está **desarrollado a partir del proyecto MIT [openflipbook](https://github.com/eren23/openflipbook)** y añade:

- Infraestructura de IA adaptada para China continental (DeepSeek + DashScope + SiliconFlow)
- Arquitectura de imagen con dos proveedores SiliconFlow + DashScope (mejora de velocidad 10×)
- Flujo de tareas asíncrono en el servidor, eliminando el tránsito base64 del navegador
- Persistencia de metadatos con PostgreSQL y almacenamiento local TTL para imágenes
- Janitor en segundo plano; la limpieza nunca bloquea las peticiones de los usuarios
- Scripts completos de arranque y reinicio local con un solo comando
- Corrección de compatibilidad con Node.js v25

Consulta el proyecto original y el archivo `LICENSE` de este repositorio para los detalles de licencia.
