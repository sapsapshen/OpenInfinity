# OpenInfinity

[中文](./README.md) | [English](./README.en.md) | [Español](./README.es.md)

> **OpenInfinity está desarrollado sobre el proyecto MIT [openflipbook](https://github.com/eren23/openflipbook).**  
> Mantiene el modelo original de “imagen como página, clic como navegación y exploración infinita”, pero adapta la arquitectura para despliegues en China continental, almacenamiento local y operación más estable.

OpenInfinity es una solución local-first para exploración visual interactiva y navegación de contenido generado por IA:

- **Frontend**: Next.js 15 App Router
- **Backend**: FastAPI
- **Planificación textual**: DeepSeek
- **Visión / generación de imagen / video**: Alibaba Cloud DashScope (Qwen-VL / Wanx)
- **Metadatos**: PostgreSQL
- **Persistencia de imágenes**: almacenamiento TTL en archivos locales dentro del proyecto

## Vista previa

| Interfaz de generación y navegación | Interfaz de exploración de nodos |
| --- | --- |
| ![OpenInfinity screenshot 1](./68d2a816-f0c8-4e86-8704-a23d11b731f0.png) | ![OpenInfinity screenshot 2](./f1089dd5-6497-4065-875c-539ceb01f5ad.png) |

## Por qué recomendamos servicios de IA locales

Para despliegues orientados a China continental, se recomienda **DeepSeek + Alibaba Cloud DashScope**:

1. **Mejor accesibilidad de red** en desarrollo y producción.
2. **Latencia más predecible** para planificación, VLM, imagen y video.
3. **Ventajas operativas y de cumplimiento** en entornos locales.
4. **Menor dependencia** de servicios extranjeros, fuentes remotas o cadenas de proxy.

## Arquitectura técnica

### Modelo de interacción

OpenInfinity sigue la lógica central de openflipbook:

1. El usuario introduce un tema y obtiene una imagen explicativa con anotaciones.
2. Hace clic en cualquier región de la imagen.
3. Un modelo visual interpreta el área seleccionada.
4. Un modelo de planificación genera la siguiente página a partir de ese sujeto.
5. El estilo visual se mantiene entre páginas para formar un árbol de exploración.

### Capas del sistema

| Capa | Tecnología | Responsabilidad |
| --- | --- | --- |
| Web | Next.js 15 | Renderizado, interacción, proxy API, persistencia de nodos |
| Backend | FastAPI | Planificación, comprensión del clic, imagen y video |
| Base de datos | PostgreSQL | Nodos, sesiones, grafo padre-hijo, metadatos |
| Almacenamiento | Archivos locales + TTL | Imágenes persistentes con limpieza automática |

### Decisiones de ingeniería

- **SSE** para mostrar el estado del proceso en tiempo real.
- **Almacenamiento local de imágenes** en lugar de OSS / S3 / R2 por defecto.
- **Nodos con permalink** y navegación padre-hijo.
- **Herencia de estilo** basada en la salida del modelo visual.
- **Arranque local completo** mediante `run-local.sh`, sin depender de Docker.

## Pila de IA recomendada

| Capacidad | Proveedor recomendado | Implementación actual |
| --- | --- | --- |
| Planificación textual | DeepSeek | `deepseek-v4-flash` |
| Comprensión visual | DashScope | `qwen-vl-max-latest` |
| Texto a imagen | DashScope Wanx | `wanx2.1-t2i-*` |
| Imagen a video | DashScope Wanx i2v | `wanx2.1-i2v-*` |

## Estructura del proyecto

```text
apps/
  backend/   Servicio FastAPI de orquestación de IA
  web/       Sitio Next.js, interacción y APIs de persistencia
docker-compose.yml
run-local.sh
```

## Requisitos previos

- Node.js 20+
- npm
- Python 3.11 / 3.12 / 3.13
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

Después completa:

- `DEEPSEEK_API_KEY`
- `DASHSCOPE_API_KEY`
- `POSTGRES_URL`
- `NEXT_PUBLIC_SITE_URL`

> `NEXT_PUBLIC_SITE_URL` debe ser un dominio público accesible si quieres usar generación de video basada en imagen con DashScope.

## Inicio local con un solo comando (recomendado)

```bash
bash ./run-local.sh
```

El script hace automáticamente:

1. Inicializa PostgreSQL dentro del proyecto
2. Inicia PostgreSQL
3. Crea el entorno virtual del backend e instala dependencias
4. Instala dependencias del frontend
5. Inicia FastAPI y Next.js

URLs por defecto:

- `http://127.0.0.1:3000/play`
- `http://127.0.0.1:3000/status`

Comandos habituales:

```bash
bash ./run-local.sh start
bash ./run-local.sh stop
bash ./run-local.sh restart
bash ./run-local.sh status
bash ./run-local.sh clean
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

- Adaptación para infraestructura de IA en China continental
- Persistencia de metadatos con PostgreSQL
- Almacenamiento local TTL para imágenes
- Script de arranque completo en local

Consulta el proyecto original y el archivo `LICENSE` de este repositorio para los detalles de licencia.
